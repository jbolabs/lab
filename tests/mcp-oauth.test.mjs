import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import test, { after } from "node:test";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(root, "node_modules", "oauth-test-"));
after(() => rmSync(out, { recursive: true, force: true }));
await build({ stdin: { contents: `
 import { createElement } from "react";
 import { renderToStaticMarkup } from "react-dom/server";
 import { ConsentForm } from "./src/components/settings/oauth-consent.tsx";
 export function renderConsent(scopes) { return renderToStaticMarkup(createElement(ConsentForm, {ticket:'test',name:'Test assistant',redirectHost:'client.example',email:'jake@example.com',scopes,mailboxes:[{id:'inbox',address:'jake@example.com'}]})); }
 export { requestAgentSend, confirmAgentSend } from "./src/lib/agent/approvals/utils.ts";
 export { runEmailTool } from "./src/lib/agent/tools.ts";
 export { POST as mcpRequest } from "./src/app/mcp/route.ts";
 export { exportDatabaseRecords, restoreDatabaseRecords } from "./src/lib/backups/export.ts";
 export * from "./src/lib/oauth/config.ts";
 export * from "./src/lib/oauth/protocol.ts";
 export * from "./src/lib/oauth/consent.ts";
 export * from "./src/lib/oauth/store.ts";
 export * from "./src/lib/oauth/auth.ts";
 export * from "./src/lib/mcp/auth.ts";
 export * from "./src/lib/mcp/admin-auth.ts";
 export * from "./server/runtime/sqlite-database.ts";
`, resolveDir: root, sourcefile: "oauth-test.ts" }, outfile: join(out, "entry.mjs"), jsx: "automatic", bundle: true, platform: "node", format: "esm", packages: "external", tsconfig: join(root, "tsconfig.json"), alias: { "cloudflare:workers": "./server/runtime/cloudflare-workers.ts", "next/headers": "next/headers.js", "next/server": "next/server.js" }, logLevel: "silent" });
const { renderConsent, requestAgentSend, confirmAgentSend, runEmailTool, mcpRequest, exportDatabaseRecords, restoreDatabaseRecords, SqliteDatabase, OAuthStore, registerClient, validateAuthorization, completeConsent, authenticateOAuth, authenticateMcpRequest, metadata, tokenEndpoint, revokeToken, hash, secret, now, oauthError } = await import(pathToFileURL(join(out, "entry.mjs")));
const origin = "https://mail.example.com";
const resource = `${origin}/mcp`;
// RFC 7636 section 4.2 example; expected challenge is independent of the implementation.
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const redirect = "http://127.0.0.1:18999/callback";
function fixture(beforeOAuth = false) {
 const DB = new SqliteDatabase(":memory:");
 DB.db.pragma("foreign_keys = OFF");
 for (const migration of JSON.parse(readFileSync(join(root, "src/lib/migrations/bundle.json"))).migrations) { if (beforeOAuth && migration.name === "0067_add_mcp_oauth.sql") continue; for (const sql of migration.statements) DB.db.exec(sql); }
 DB.db.pragma("foreign_keys = ON");
 DB.db.prepare("INSERT INTO users(id,email,name,password_hash,role,disabled,created_at) VALUES ('user','jake@example.com','Jake','unused','admin',0,?)").run(now());
 DB.db.prepare("INSERT INTO domains(id,user_id,hostname,zone_id,created_at) VALUES ('domain','user','example.com','test-zone',?)").run(now());
 DB.db.prepare("INSERT INTO mailboxes(id,user_id,domain_id,local_part,created_at) VALUES ('inbox','user','domain','jake',?)").run(now());
 const env = { DB, APP_URL: origin };
 after(() => DB.db.close());
 return { env, store: new OAuthStore(DB), user: { id: 'user', email: 'jake@example.com', role: 'admin' }, db: DB.db };
}
async function client(f) {
 const response = await registerClient(f.env, new Request(`${origin}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Test assistant", redirect_uris: [redirect] }) }));
 assert.equal(response.status, 201);
 return (await response.json()).client_id;
}
function authUrl(id, extra = {}) {
 return `${origin}/oauth/authorize?${new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: "code", scope: "mcp:read mcp:draft offline_access", resource, code_challenge: challenge, code_challenge_method: "S256", state: "my-state", ...extra })}`;
}
async function authorize(f, id, options = {}) {
 const validated = await validateAuthorization(f.env, new Request(authUrl(id, options)));
 const ticket = secret();
 await f.env.DB.prepare("INSERT INTO oauth_requests(hash,user_id,parameters,expires_at) VALUES (?,?,?,?)").bind(await hash(ticket), 'user', JSON.stringify(validated.parameters), now()+600).run();
 const url = await completeConsent(f.env, f.user, ticket, 'allow', validated.scopes, validated.scopes.some(s=>s.startsWith('mcp:')&&!s.startsWith('mcp:calendar-')) ? ['inbox'] : []);
 assert.equal(new URL(url).searchParams.get('state'), 'my-state');
 assert.equal(new URL(url).searchParams.get('iss'), origin);
 return { code: new URL(url).searchParams.get('code'), ticket };
}
async function exchange(f, id, params) {
 const response = await tokenEndpoint(f.env, new Request(`${origin}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, resource, ...params }) }));
 return { status: response.status, body: await response.json() };
}
const exchangeCode = (f,id,code,extra={})=>exchange(f,id,{grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier,...extra});
const refresh = (f,id,token,extra={})=>exchange(f,id,{grant_type:'refresh_token',refresh_token:token,...extra});
const principal = (f,token) => authenticateOAuth(f.env,new Request(resource),token);

test('discovery advertises PKCE, DCR and a resource-bound MCP endpoint',async()=>{
 const f=fixture();
 assert.equal((await metadata(f.env,new Request(`${origin}/.well-known/oauth-protected-resource`),true).json()).resource,resource);
 const m=await metadata(f.env,new Request(`${origin}/.well-known/oauth-authorization-server`)).json();
 assert.deepEqual(m.code_challenge_methods_supported,['S256']); assert.deepEqual(m.token_endpoint_auth_methods_supported,['none']);
});
test('browser grant exchanges with RFC PKCE vector, stores hashes, and refreshes',async()=>{
 const f=fixture(), id=await client(f), {code}=await authorize(f,id);
 const result=await exchangeCode(f,id,code); assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.token_type,'Bearer'); assert.ok([899,900].includes(result.body.expires_in));
 assert.deepEqual((await principal(f,result.body.access_token)).mailboxIds,['inbox']);
 const stored=f.db.prepare('SELECT * FROM oauth_tokens').get();
 assert.equal(stored.access_hash,createHash('sha256').update(result.body.access_token).digest('hex'));
 assert.ok(!JSON.stringify(stored).includes(result.body.refresh_token));
 assert.equal((await exchangeCode(f,id,code)).status,400);
 const next=await refresh(f,id,result.body.refresh_token);assert.equal(next.status,200,JSON.stringify(next.body));
 assert.notEqual(next.body.refresh_token,result.body.refresh_token);
 assert.equal((await principal(f,next.body.access_token)).user.id,'user');
});
test('bad PKCE consumes the code and cannot be retried',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id);
 assert.equal((await exchangeCode(f,id,code,{code_verifier:'a'.repeat(43)})).body.error,'invalid_grant');
 assert.equal((await exchangeCode(f,id,code)).body.error,'invalid_grant');
});
test('a refresh replay revokes the entire connection',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id), first=await exchangeCode(f,id,code);
 const next=await refresh(f,id,first.body.refresh_token);assert.equal(next.status,200);
 assert.equal((await refresh(f,id,first.body.refresh_token)).body.error,'invalid_grant');
 assert.equal(await principal(f,next.body.access_token),null);
 assert.equal((await refresh(f,id,next.body.refresh_token)).body.error,'invalid_grant');
});
test('concurrent code exchanges issue exactly one token pair',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id);
 const attempts=await Promise.all([exchangeCode(f,id,code),exchangeCode(f,id,code)]);
 assert.deepEqual(attempts.map(a=>a.status).sort(),[200,400]); assert.equal(f.db.prepare('SELECT count(*) n FROM oauth_tokens').get().n,1);
});
test('concurrent refresh loses closed and invalidates the family',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id),first=await exchangeCode(f,id,code);
 const results=await Promise.all([refresh(f,id,first.body.refresh_token),refresh(f,id,first.body.refresh_token)]);
 assert.ok(results.some(r=>r.status===400));
 for(const r of results.filter(r=>r.status===200))assert.equal(await principal(f,r.body.access_token),null);
});
test('resource, redirect, client binding and unsupported scopes fail closed',async()=>{
 const f=fixture(),id=await client(f),other=await client(f);
 for(const extra of [{resource:'https://elsewhere.example/mcp'},{redirect_uri:'https://evil.example/cb'},{code_challenge_method:'plain'},{scope:'send'},{scope:'mcp:read domains'}])await assert.rejects(()=>validateAuthorization(f.env,new Request(authUrl(id,extra))));
 const {code}=await authorize(f,id);
 await assert.rejects(()=>exchangeCode(f,id,code,{resource:'https://elsewhere.example/mcp'}));
 assert.equal((await exchangeCode(f,other,code)).body.error,'invalid_grant');
 assert.equal((await exchangeCode(f,id,code,{redirect_uri:redirect+'?changed'})).status,400);
});
test('consent is bound to user, permissions, mailbox access and a one-time request',async()=>{
 const f=fixture(),id=await client(f),{ticket}=await authorize(f,id);
 await assert.rejects(()=>completeConsent(f.env,f.user,ticket,'allow',['mcp:read'],['inbox']));
 const validated=await validateAuthorization(f.env,new Request(authUrl(id))), fresh=secret();
 await f.env.DB.prepare('INSERT INTO oauth_requests(hash,user_id,parameters,expires_at) VALUES (?,?,?,?)').bind(await hash(fresh),'user',JSON.stringify(validated.parameters),now()+600).run();
 await assert.rejects(()=>completeConsent(f.env,{...f.user,id:'other'},fresh,'allow',['mcp:read'],['inbox']));
 await assert.rejects(()=>completeConsent(f.env,f.user,fresh,'allow',['mcp:organize'],['inbox']));
 await assert.rejects(()=>completeConsent(f.env,f.user,fresh,'allow',['mcp:read'],['not-allowed']));
 const denied=new URL(await completeConsent(f.env,f.user,fresh,'deny',[],[]));
 assert.equal(denied.searchParams.get('error'),'access_denied'); assert.equal(denied.searchParams.get('code'),null);
});
test('expiry, disabled users and removed mailbox authorization take effect',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id),r=await exchangeCode(f,id,code);
 f.db.prepare("UPDATE users SET disabled=1 WHERE id='user'").run(); assert.equal(await principal(f,r.body.access_token),null);
 f.db.prepare("UPDATE users SET disabled=0 WHERE id='user'").run();
 f.db.prepare("UPDATE oauth_tokens SET access_expires_at=0").run(); assert.equal(await principal(f,r.body.access_token),null);
 f.db.prepare("UPDATE oauth_tokens SET access_expires_at=?").run(now()+900);
 f.db.prepare("DELETE FROM mcp_key_mailboxes").run();assert.deepEqual((await principal(f,r.body.access_token)).mailboxIds,[]);
 f.db.prepare("UPDATE oauth_grants SET expires_at=0").run(); assert.equal(await principal(f,r.body.access_token),null);
});
test('scope narrowing persists and cannot be expanded by a later refresh',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id),first=await exchangeCode(f,id,code);
 const narrowed=await refresh(f,id,first.body.refresh_token,{scope:'mcp:read offline_access'});assert.equal(narrowed.status,200);
 assert.deepEqual((await principal(f,narrowed.body.access_token)).scopes,['mcp:read']);
 assert.equal((await refresh(f,id,narrowed.body.refresh_token,{scope:'mcp:read mcp:draft'})).body.error,'invalid_scope');
});
test('revocation invalidates access and refresh and is idempotent',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id),r=await exchangeCode(f,id,code);
 const request=()=>new Request(`${origin}/oauth/revoke`,{method:'POST',body:new URLSearchParams({client_id:id,token:r.body.refresh_token})});
 assert.equal((await revokeToken(f.env,request())).status,200); assert.equal((await revokeToken(f.env,request())).status,200);
 assert.equal(await principal(f,r.body.access_token),null); assert.equal((await refresh(f,id,r.body.refresh_token)).status,400);
});
test('admin tokens retain scoped identity and lose access on role removal',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id,{scope:'domains'}),r=await exchangeCode(f,id,code);
 const p=await authenticateMcpRequest(f.env,new Request(resource,{headers:{Authorization:`Bearer ${r.body.access_token}`}}));
 assert.deepEqual(p.scopes,['domains']);assert.deepEqual(p.mailboxIds,[]);
 f.db.prepare("UPDATE users SET role='user' WHERE id='user'").run();assert.equal(await principal(f,r.body.access_token),null);
});
test('registration rejects external plaintext callbacks and bounded registration prevents storage abuse',async()=>{
 const f=fixture();
 await assert.rejects(()=>registerClient(f.env,new Request(`${origin}/oauth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:['http://evil.example/callback']})})));
 for(let i=0;i<19;i++)await client(f);
 await assert.rejects(()=>client(f),e=>e.status===429);
 assert.equal((await oauthError(new Error('secret-token')).json()).error_description,'Authorization is temporarily unavailable');
});

test('backups work before OAuth migration, after it, and when restoring older full documents',async()=>{
 const older=fixture(true);
 const oldBytes=await exportDatabaseRecords(older.env.DB);
 const legacy=JSON.parse(new TextDecoder().decode(oldBytes));
 delete legacy.tables.oauth_clients;delete legacy.tables.oauth_grants;
 legacy.includedTables=legacy.includedTables.filter(t=>!t.startsWith('oauth_'));
 const current=fixture();
 await restoreDatabaseRecords(current.env.DB,new TextEncoder().encode(JSON.stringify(legacy)).buffer);
 assert.equal(current.db.prepare("SELECT email FROM users WHERE id='user'").get().email,'jake@example.com');
 assert.equal(current.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,0);
 const id=await client(current),{code}=await authorize(current,id),r=await exchangeCode(current,id,code);
 assert.equal(r.status,200);
 const saved=await exportDatabaseRecords(current.env.DB);
 const document=JSON.parse(new TextDecoder().decode(saved));
 assert.equal(document.tables.oauth_grants.length,1);
 assert.equal(document.tables.oauth_clients.length,1);
 assert.equal(document.tables.oauth_tokens,undefined);
 await assert.rejects(()=>restoreDatabaseRecords(older.env.DB,saved.buffer),/Apply pending database migrations/);
 await restoreDatabaseRecords(current.env.DB,saved.buffer);
 assert.equal(current.db.prepare('SELECT count(*) n FROM oauth_grants').get().n,1);
 assert.equal(await principal(current,r.body.access_token),null);
});

test('a grant without offline_access issues no refresh token',async()=>{
 const f=fixture(),id=await client(f),{code}=await authorize(f,id,{scope:'mcp:read'}),r=await exchangeCode(f,id,code);
 assert.equal(r.status,200);assert.equal(r.body.refresh_token,undefined);assert.equal(r.body.scope,'mcp:read');
 assert.deepEqual((await principal(f,r.body.access_token)).scopes,['mcp:read']);
});
test('declining requested offline access does not silently grant it',async()=>{
 const f=fixture(),id=await client(f),v=await validateAuthorization(f.env,new Request(authUrl(id))),ticket=secret();
 await f.env.DB.prepare('INSERT INTO oauth_requests(hash,user_id,parameters,expires_at) VALUES (?,?,?,?)').bind(await hash(ticket),'user',JSON.stringify(v.parameters),now()+600).run();
 const callback=new URL(await completeConsent(f.env,f.user,ticket,'allow',['mcp:read'],['inbox']));
 const r=await exchangeCode(f,id,callback.searchParams.get('code'));
 assert.equal(r.status,200);assert.equal(r.body.refresh_token,undefined);assert.equal(r.body.scope,'mcp:read');
});

const defaultScopes = ['mcp:read', 'mcp:draft', 'mcp:organize', 'mcp:request-send', 'mcp:send', 'mcp:calendar-read', 'mcp:calendar-write', 'offline_access'];
test('scope-less clients receive mail/calendar consent and renewable access, without admin privileges', async () => {
 const f=fixture(), id=await client(f);
 const url=new URL(authUrl(id)); url.searchParams.delete('scope');
 const validated=await validateAuthorization(f.env,new Request(url));
 assert.deepEqual(validated.scopes,defaultScopes);
 const {code}=await authorize(f,id,{scope:validated.parameters.scope});
 const result=await exchangeCode(f,id,code); assert.equal(result.status,200);
 assert.ok(result.body.refresh_token);
 assert.deepEqual((await principal(f,result.body.access_token)).scopes,defaultScopes.slice(0,-1));
 f.db.prepare('UPDATE oauth_tokens SET access_expires_at=0').run();
 assert.equal(await principal(f,result.body.access_token),null);
 const next=await refresh(f,id,result.body.refresh_token); assert.equal(next.status,200);
 assert.deepEqual((await principal(f,next.body.access_token)).scopes,defaultScopes.slice(0,-1));
});

test('MCP challenge negotiates renewable mail/calendar access and the token can call calendar tools', async () => {
 const f=fixture(); globalThis.__mailflareNodeEnv=f.env;
 try {
  const denied=await mcpRequest(new Request(resource,{method:'POST'}));
  assert.equal(denied.status,401);
  const scope=/scope="([^"]+)"/.exec(denied.headers.get('WWW-Authenticate'))[1];
  assert.deepEqual(scope.split(' '),defaultScopes);
  const id=await client(f),{code}=await authorize(f,id,{scope}),result=await exchangeCode(f,id,code);
  assert.equal(result.status,200);
  const response=await mcpRequest(new Request(resource,{method:'POST',headers:{Authorization:`Bearer ${result.body.access_token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_calendars',arguments:{}}})}));
  assert.equal(response.status,200);
  const text=await response.text();
  const rpc=JSON.parse(response.headers.get('Content-Type').includes('text/event-stream') ? text.split('\n').find(line=>line.startsWith('data: ')).slice(6) : text);
  assert.equal(rpc.error,undefined,JSON.stringify(rpc));
  assert.equal(rpc.result.isError,false,JSON.stringify(rpc));
  assert.deepEqual(JSON.parse(rpc.result.content[0].text),{calendars:[{id:'personal',name:'Personal calendar',timeZone:'UTC',writable:true}]});
 } finally { delete globalThis.__mailflareNodeEnv; }
});

async function callMcp(f, token, name, args) {
 globalThis.__mailflareNodeEnv=f.env;
 const response=await mcpRequest(new Request(resource,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
 assert.equal(response.status,200);
 const text=await response.text();
 return JSON.parse(response.headers.get('Content-Type').includes('text/event-stream') ? text.split('\n').find(line=>line.startsWith('data: ')).slice(6) : text);
}
async function sendFixture(t) {
 const f=fixture(), deliveries=[], queued=[];
 t.after(()=>{delete globalThis.__mailflareNodeEnv;});
 f.env.BUCKET={get:async()=>null};
 f.env.EMAIL={send:async message=>{deliveries.push(message);return {messageId:'<delivered@example.com>'};}};
 f.env.OUTBOUND_QUEUE={send:async message=>{queued.push(message);}};
 f.db.prepare("UPDATE domains SET sending_provider='cloudflare'").run();
 const id=await client(f), {code}=await authorize(f,id,{scope:defaultScopes.join(' ')}), token=await exchangeCode(f,id,code);
 const draft=await runEmailTool({env:f.env,user:f.user,mailboxId:'inbox',origin:'mcp'},'draft_email',{to:'recipient@example.net',subject:'Hello',body:'A direct message.'});
 return {...f,deliveries,queued,token:token.body.access_token,args:{mailboxId:'inbox',draftId:draft.draftId,expectedRevision:1}};
}
test('direct sending requires its own consented scope and the selected mailbox',async t=>{
 const f=await sendFixture(t),id=await client(f),{code}=await authorize(f,id,{scope:'mcp:read mcp:draft mcp:request-send'}),limited=await exchangeCode(f,id,code);
 const denied=await callMcp(f,limited.body.access_token,'send_draft',f.args);
 assert.ok(denied.error || denied.result.isError);
 assert.equal(f.deliveries.length,0);
 const wrongMailbox=await callMcp(f,f.token,'send_draft',{...f.args,mailboxId:'other'});
 assert.equal(wrongMailbox.result.isError,true);assert.equal(f.deliveries.length,0);
 f.db.prepare('DELETE FROM mcp_key_mailboxes').run();
 const removed=await callMcp(f,f.token,'send_draft',f.args);
 assert.equal(removed.result.isError,true);assert.equal(f.deliveries.length,0);
});
test('direct sending checks revision and concurrent calls/retries deliver only once',async t=>{
 const f=await sendFixture(t);
 const stale=await callMcp(f,f.token,'send_draft',{...f.args,expectedRevision:2});
 assert.equal(stale.result.isError,true);assert.equal(f.deliveries.length,0);
 const results=await Promise.all([callMcp(f,f.token,'send_draft',f.args),callMcp(f,f.token,'send_draft',f.args)]);
 assert.ok(results.some(r=>r.result?.isError===false));
 assert.equal(f.deliveries.length,1);
 assert.equal(f.deliveries[0].subject,'Hello');assert.equal(f.deliveries[0].text,'A direct message.');assert.deepEqual(f.deliveries[0].to,['recipient@example.net']);
 const retry=await callMcp(f,f.token,'send_draft',f.args);
 assert.equal(JSON.parse(retry.result.content[0].text).status,'sent');assert.equal(f.deliveries.length,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM agent_send_approvals').get().n,1);
});
test('direct sending preserves schedules and does not resend an uncertain delivery',async t=>{
 const f=await sendFixture(t);
 f.db.prepare('UPDATE agent_draft_metadata SET scheduled_at=?').run(now()+3600);
 const scheduled=await callMcp(f,f.token,'send_draft',f.args);
 assert.equal(scheduled.result.isError,false,JSON.stringify(scheduled));
 assert.equal(JSON.parse(scheduled.result.content[0].text).scheduled,true);assert.equal(f.queued.length,1);assert.equal(f.deliveries.length,0);
 const g=await sendFixture(t);let attempts=0;
 g.env.EMAIL.send=async()=>{attempts++;throw new Error('provider disconnected');};
 const failed=await callMcp(g,g.token,'send_draft',g.args);assert.equal(failed.result.isError,true);
 const retry=await callMcp(g,g.token,'send_draft',g.args);
 assert.equal(JSON.parse(retry.result.content[0].text).status,'unknown');assert.equal(attempts,1);
});

test('direct sending and a browser confirmation share a single delivery per draft',async t=>{
 const f=await sendFixture(t);
 const review=await requestAgentSend(f.env,f.user,f.args.draftId,1);
 let release,started;
 const held=new Promise(resolve=>{release=resolve;});
 const sending=new Promise(resolve=>{started=resolve;});
 f.env.EMAIL.send=async message=>{
  const attempt=f.deliveries.push(message);
  if(attempt===1){started();await held;}
  return {messageId:`<delivered-${attempt}@example.com>`};
 };
 const direct=callMcp(f,f.token,'send_draft',f.args);
 await sending;
 try { await assert.rejects(confirmAgentSend(f.env,f.user,review.approvalId)); }
 finally {release();await direct;}
 assert.equal(f.deliveries.length,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM agent_send_approvals WHERE status='sent'").get().n,1);
});

test('rendered consent explicitly discloses sending without review',()=>{
 const html=renderConsent(defaultScopes);
 assert.match(html,/Send email directly without your review/);
 assert.match(html,/If you allow direct sending, this app can send email without your review/);
 assert.match(html,/value="mcp:send"/);
 assert.doesNotMatch(renderConsent(['mcp:read']),/value="mcp:send"/);
});
