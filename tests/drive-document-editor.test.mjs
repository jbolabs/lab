import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(project, "node_modules", "drive-editor-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({ entryPoints: [join(project, "src/app/(drive)/drive/document/page.tsx")], outfile: join(directory, "editor.mjs"), jsx: "automatic", bundle: true, platform: "node", format: "esm", packages: "external", tsconfig: join(project, "tsconfig.json"), plugins: [{ name: "navigation-boundaries", setup(builder) {
 builder.onResolve({ filter: /^(next\/navigation|next\/link|@\/hooks\/use-current-user)$/ }, args => ({ path: args.path, namespace: "fixture" }));
 builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "next/navigation" ? "export function useSearchParams(){return new URLSearchParams(globalThis.window?.location.search ?? '')}" : args.path === "next/link" ? "import {createElement} from 'react';export default function Link(props){return createElement('a',props)}" : "export function useCurrentUser(){return {id:'user'}}", loader: "js", resolveDir: project }));
} }], logLevel: "silent" });

test("a save completing after navigation preserves a newer draft and does not rewrite the route", async () => {
 const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://mail.example/drive/document?id=document" });
 globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.localStorage=dom.window.localStorage; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {createElement,act}=await import('react'); const {createRoot}=await import('react-dom/client');
 const {default:Editor}=await import(pathToFileURL(join(directory,'editor.mjs')).href);
 const item={id:'document',name:'Notes.md',role:'owner'}; let persisted='Original', resolveSave;
 globalThis.fetch=async (_url,init)=>init?.method==='PUT' ? new Promise(resolve=>{resolveSave=()=>{persisted='First unsaved';resolve(Response.json({item,revision:'second'}));};}) : Response.json({item,content:persisted,revision:persisted==='Original'?'first':'second'});
 const root=createRoot(document.getElementById('root'));
 const mount=()=>act(async()=>{root.render(createElement(Editor));});
 const leave=()=>act(async()=>{root.render(null);window.history.replaceState(null,'','/drive');});
 const input=async value=>act(async()=>{const textarea=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,value);textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 try {
  await mount();await input('First unsaved');
  await act(async()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='Save').click();});
  assert.equal(typeof resolveSave,'function');
  await leave();window.history.replaceState(null,'','/drive/document?id=document');await mount();
  await input('Second unsaved');await leave();
  await act(async()=>resolveSave());
  assert.equal(window.location.pathname,'/drive');
  window.history.replaceState(null,'','/drive/document?id=document');await mount();
  assert.equal(document.querySelector('textarea').value,'Second unsaved');
  assert.match(document.body.textContent,/Unsaved changes/);
 } finally {await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.IS_REACT_ACT_ENVIRONMENT;delete globalThis.fetch;}
});

async function mountEditor(id, fetch) {
 const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: `https://mail.example/drive/document?id=${id}` });
 globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.localStorage=dom.window.localStorage; globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.fetch=fetch; const NodeEvent=globalThis.Event; globalThis.Event=dom.window.Event;
 const {createElement,act}=await import('react'); const {createRoot}=await import('react-dom/client');
 const {default:Editor}=await import(pathToFileURL(join(directory,'editor.mjs')).href);
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(createElement(Editor));});
 const close=async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.IS_REACT_ACT_ENVIRONMENT;delete globalThis.fetch;globalThis.Event=NodeEvent;};
 return {dom,act,close};
}

test("Ctrl+S saves only changed text, against the loaded revision", async () => {
 const puts=[];
 const {dom,act,close}=await mountEditor('keyboard',async(_url,init)=>{ if(init?.method==='PUT'){puts.push(JSON.parse(init.body));return Response.json({item:{id:'keyboard',name:'Keys.md',role:'owner'},revision:'r2'});} return Response.json({item:{id:'keyboard',name:'Keys.md',role:'owner',parentId:null},content:'Saved',revision:'r1'}); });
 const press=()=>act(async()=>{document.querySelector('textarea').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));});
 try {
  await press();
  assert.equal(puts.length,0);
  await act(async()=>{const textarea=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Edited');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await press();await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  assert.deepEqual(puts,[{content:'Edited',expectedRevision:'r1'}]);
  assert.equal(document.querySelector('[role=alert]')?.textContent,undefined);assert.match(document.querySelector('[role=status]').textContent,/^Saved$/);
 } finally {await close();}
});

test("a view-only document opens rendered, with no editor or Save", async () => {
 const {close}=await mountEditor('viewer',async()=>Response.json({item:{id:'viewer',name:'Shared.md',role:'view',parentId:'folder'},content:'# Shared heading',revision:'r1'}));
 try {
  assert.equal(document.querySelector('h1')?.textContent,'Shared.md');
  assert.equal(document.querySelector('article h1')?.textContent,'Shared heading');
  assert.equal(document.querySelector('textarea'),null);
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent==='Save'),false);
  assert.equal(document.querySelector('a[aria-label="Back to Drive"]').getAttribute('href'),'/drive?view=shared');
 } finally {await close();}
});
