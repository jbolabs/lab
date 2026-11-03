/**
 * End-to-end check of Drive without a browser: the CLI (scripts/drive.mjs) with an API key, and the MCP tools with
 * signed upload and download URLs, each moving files larger than the 1 MiB MCP content cap.
 *
 *   npm run dev && npm run db:migrate:local && npm run db:seed   # in another shell
 *   node scripts/drive-check.mjs
 *
 * Signs in with the seeded demo account and mints its own keys. BASE_URL overrides http://localhost:3000.
 */
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(
	/\/$/u,
	""
);
const DEMO = {
	email: "admin@example.com",
	password: "demo-password-change-me",
};
const CLI = new URL("drive.mjs", import.meta.url).pathname;
const run = promisify(execFile);

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
	if (ok) {
		passed += 1;
		console.log(`  ok   ${name}`);
	} else {
		failed += 1;
		console.log(
			`  FAIL ${name}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`
		);
	}
}

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function signIn() {
	const login = await fetch(`${BASE}/api/auth/login`, {
		body: JSON.stringify(DEMO),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	if (!login.ok) {
		throw new Error(
			`login failed (${login.status}); run npm run db:seed first`
		);
	}
	return (login.headers.getSetCookie?.() ?? [])
		.map((value) => value.split(";")[0])
		.join("; ");
}

const minted = [];

async function mintKey(cookie, route, scopes) {
	const response = await fetch(`${BASE}${route}`, {
		body: JSON.stringify({
			mailboxIds: [],
			name: `drive-check ${Date.now()}`,
			scopes,
		}),
		headers: {
			"Content-Type": "application/json",
			Cookie: cookie,
			Origin: BASE,
		},
		method: "POST",
	});
	const data = await response.json();
	if (!response.ok) {
		throw new Error(
			`could not mint ${scopes.join(" ")}: ${JSON.stringify(data)}`
		);
	}
	minted.push(data.id);
	return data.key;
}

async function cli(key, ...args) {
	try {
		const { stdout } = await run("node", [CLI, ...args, "--json"], {
			env: { ...process.env, LAB_API_KEY: key, LAB_URL: BASE },
			maxBuffer: 1024 * 1024 * 200,
		});
		return JSON.parse(stdout);
	} catch (error) {
		return JSON.parse(error.stdout || JSON.stringify({ error: error.message }));
	}
}

async function mcp(key, name, args) {
	const response = await fetch(`${BASE}/mcp`, {
		body: JSON.stringify({
			id: 1,
			jsonrpc: "2.0",
			method: name ? "tools/call" : "tools/list",
			params: name ? { arguments: args, name } : {},
		}),
		headers: {
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		method: "POST",
	});
	const text = await response.text();
	const body = JSON.parse(
		text.startsWith("event:") || text.startsWith("data:")
			? text
					.split("\n")
					.find((line) => line.startsWith("data: "))
					.slice(6)
			: text
	);
	if (!name) {
		return body.result.tools.map((tool) => tool.name);
	}
	const data = JSON.parse(body.result.content[0].text);
	return body.result.isError ? { error: data.error ?? data } : data;
}

const cookie = await signIn();
const driveKey = await mintKey(cookie, "/api/api-keys", [
	"drive:read",
	"drive:write",
]);
const readKey = await mintKey(cookie, "/api/api-keys", ["drive:read"]);
const mcpKey = await mintKey(cookie, "/api/agent/mcp-keys", [
	"mcp:drive-read",
	"mcp:drive-write",
]);
const dir = await mkdtemp(path.join(tmpdir(), "drive-check-"));
const folder = `/drive-check-${Date.now()}`;

try {
	console.log("\nAPI key auth");
	const anonymous = await fetch(`${BASE}/api/drive/items`);
	check("no credentials is 401", anonymous.status === 401, anonymous.status);
	const readOnly = await fetch(`${BASE}/api/drive/upload`, {
		body: JSON.stringify({ name: "x", size: 1 }),
		headers: { Authorization: `Bearer ${readKey}` },
		method: "POST",
	});
	check(
		"a drive:read key cannot upload",
		readOnly.status === 403,
		readOnly.status
	);
	const listed = await fetch(`${BASE}/api/drive/items`, {
		headers: { Authorization: `Bearer ${readKey}` },
	});
	check("a drive:read key can list", listed.ok, listed.status);
	const attachments = await fetch(`${BASE}/api/drive/items?view=attachments`, {
		headers: { Authorization: `Bearer ${driveKey}` },
	});
	check("email attachments stay session-only", attachments.status === 403);

	console.log("\nWeb session");
	const session = { Cookie: cookie, Origin: BASE };
	const sessionFolder = await fetch(`${BASE}/api/drive/items`, {
		body: JSON.stringify({ name: `session-${Date.now()}` }),
		headers: { ...session, "Content-Type": "application/json" },
		method: "POST",
	});
	const { item: sessionItem } = await sessionFolder.json();
	check("the app can still create a folder", sessionFolder.ok);
	const crossSite = await fetch(`${BASE}/api/drive/items/bulk`, {
		body: JSON.stringify({ action: "trash", ids: [sessionItem.id] }),
		headers: { Cookie: cookie, Origin: "https://evil.example" },
		method: "POST",
	});
	check("session writes still need the app origin", crossSite.status === 403);
	const sessionList = await fetch(`${BASE}/api/drive/items?view=attachments`, {
		headers: session,
	});
	check("the app still lists email attachments", sessionList.ok);
	const sessionTrash = await fetch(`${BASE}/api/drive/items/bulk`, {
		body: JSON.stringify({ action: "trash", ids: [sessionItem.id] }),
		headers: session,
		method: "POST",
	});
	const sessionDelete = await fetch(
		`${BASE}/api/drive/items/${sessionItem.id}`,
		{
			headers: session,
			method: "DELETE",
		}
	);
	check("the app can trash and delete", sessionTrash.ok && sessionDelete.ok);

	console.log("\nCLI");
	const small = randomBytes(5 * 1024 * 1024 + 123);
	// Two parts: the server's part size is 64 MiB.
	const large = randomBytes(64 * 1024 * 1024 + 4567);
	await writeFile(path.join(dir, "clip.mp4"), small);
	await writeFile(path.join(dir, "big.bin"), large);
	const made = await cli(driveKey, "mkdir", `${folder}/nested`);
	check("mkdir creates missing parents", made.item?.kind === "folder", made);
	const uploaded = await cli(
		driveKey,
		"upload",
		path.join(dir, "clip.mp4"),
		path.join(dir, "big.bin"),
		"--to",
		folder
	);
	const [clip, big] = uploaded.items ?? [];
	check("uploads a 5 MiB file", clip?.size === small.length, uploaded);
	check(
		"uploads a two-part 64 MiB+ file",
		big?.size === large.length,
		uploaded
	);
	const listing = await cli(driveKey, "ls", folder);
	check(
		"ls shows the uploads",
		["big.bin", "clip.mp4", "nested"].every((name) =>
			listing.items?.some((item) => item.name === name)
		),
		listing
	);
	const downloaded = await cli(
		driveKey,
		"download",
		`${folder}/big.bin`,
		path.join(dir, "big.out")
	);
	check(
		"download round-trips the bytes",
		sha(await readFile(downloaded.path)) === sha(large)
	);

	// Resume: a partial download plus its ETag continues from where it stopped.
	const head = await fetch(
		`${BASE}/api/drive/items/${clip.id}/content?download=1`,
		{ headers: { Authorization: `Bearer ${driveKey}`, Range: "bytes=0-0" } }
	);
	// The kept prefix is zeros, so only a real resume (not a fresh download) produces these bytes.
	const prefix = Buffer.alloc(1_000_000);
	await writeFile(path.join(dir, "resume.mp4.part"), prefix);
	await writeFile(
		path.join(dir, "resume.mp4.part.etag"),
		head.headers.get("ETag")
	);
	await cli(driveKey, "download", clip.id, path.join(dir, "resume.mp4"));
	check(
		"download resumes a partial file",
		sha(await readFile(path.join(dir, "resume.mp4"))) ===
			sha(Buffer.concat([prefix, small.subarray(prefix.length)]))
	);
	await writeFile(path.join(dir, "stale.mp4.part"), prefix);
	await writeFile(path.join(dir, "stale.mp4.part.etag"), '"changed"');
	await cli(driveKey, "download", clip.id, path.join(dir, "stale.mp4"));
	check(
		"download starts over when the file changed",
		sha(await readFile(path.join(dir, "stale.mp4"))) === sha(small)
	);

	// Resume: the CLI picks up an upload whose first part already arrived.
	await writeFile(path.join(dir, "resumed.bin"), large);
	const { mtimeMs } = await stat(path.join(dir, "resumed.bin"));
	const { item: folderItem } = await cli(driveKey, "info", folder);
	const startResponse = await fetch(`${BASE}/api/drive/upload`, {
		body: JSON.stringify({
			fingerprint: String(Math.floor(mtimeMs)),
			name: "resumed.bin",
			parentId: folderItem.id,
			size: large.length,
		}),
		headers: { Authorization: `Bearer ${driveKey}` },
		method: "POST",
	});
	const pending = await startResponse.json();
	await fetch(`${BASE}/api/drive/upload/${pending.id}?part=1`, {
		body: large.subarray(0, pending.partSize),
		headers: { Authorization: `Bearer ${driveKey}` },
		method: "PUT",
	});
	const statusResponse = await fetch(`${BASE}/api/drive/upload/${pending.id}`, {
		headers: { Authorization: `Bearer ${driveKey}` },
	});
	const missing = await statusResponse.json();
	check(
		"upload status reports the missing part",
		missing.missing?.join(",") === "2",
		missing
	);
	const resumed = await cli(
		driveKey,
		"upload",
		path.join(dir, "resumed.bin"),
		"--to",
		folder
	);
	check(
		"upload resumes the interrupted upload",
		resumed.items?.[0]?.id === pending.id &&
			resumed.items[0].size === large.length,
		resumed
	);

	const renamed = await cli(driveKey, "rename", clip.id, "renamed.mp4");
	check("rename", renamed.item?.name === "renamed.mp4", renamed);
	const moved = await cli(driveKey, "mv", clip.id, `${folder}/nested`);
	check("mv", moved.count === 1, moved);
	const info = await cli(driveKey, "info", clip.id);
	check(
		"info shows the new path",
		info.path?.map((crumb) => crumb.name).join("/") ===
			`${folder.slice(1)}/nested/renamed.mp4`,
		info
	);
	const shared = await cli(driveKey, "share", clip.id, "--link", "on");
	check("share --link on", shared.linkUrl?.includes("/d/"), shared);
	const publicLink = await fetch(
		`${BASE}/api/drive/public/${shared.linkUrl.split("/d/")[1]}?download=1`
	);
	check(
		"the public link serves the file",
		sha(Buffer.from(await publicLink.arrayBuffer())) === sha(small)
	);
	const unshared = await cli(driveKey, "share", clip.id, "--link", "off");
	check("share --link off", unshared.linkUrl === null, unshared);
	const usage = await cli(driveKey, "usage");
	check("usage", usage.storageUsed >= small.length + 2 * large.length, usage);
	const trashed = await cli(driveKey, "rm", big.id);
	const trash = await cli(driveKey, "ls", "--trash");
	check(
		"rm moves to trash",
		trashed.count === 1 && trash.items.some((item) => item.id === big.id)
	);
	const restored = await cli(driveKey, "restore", big.id);
	check("restore", restored.count === 1, restored);
	const search = await cli(driveKey, "ls", "--search", "resumed");
	check(
		"ls --search",
		search.items?.some((item) => item.id === pending.id),
		search
	);
	const denied = await cli(readKey, "mkdir", `${folder}/nope`);
	check(
		"CLI reports a missing scope",
		/drive:write/u.test(denied.error),
		denied
	);

	console.log("\nMCP");
	const tools = await mcp(mcpKey);
	check(
		"lists the Drive tools",
		[
			"get_drive_item",
			"get_drive_download_url",
			"create_drive_folder",
			"start_drive_upload",
			"complete_drive_upload",
			"cancel_drive_upload",
			"rename_drive_item",
			"update_drive_items",
			"share_drive_item",
		].every((name) => tools.includes(name)),
		tools
	);
	const mcpFolder = await mcp(mcpKey, "create_drive_folder", {
		name: "mcp",
		parentId: folderItem.id,
	});
	const started = await mcp(mcpKey, "start_drive_upload", {
		contentType: "video/mp4",
		name: "mcp.mp4",
		parentId: mcpFolder.item.id,
		size: small.length,
	});
	check(
		"start_drive_upload returns one signed part URL",
		started.parts?.length === 1,
		started
	);
	const early = await mcp(mcpKey, "complete_drive_upload", { id: started.id });
	check(
		"complete_drive_upload hands back missing parts",
		early.complete === false && early.parts?.[0]?.url,
		early
	);
	const forged = await fetch(
		started.parts[0].url.replace(/token=[^&]+/u, "token=bad"),
		{
			body: small,
			method: "PUT",
		}
	);
	check("a bad token is refused", forged.status === 401, forged.status);
	// What a model with a shell does: curl -T file URL.
	const put = await fetch(early.parts[0].url, { body: small, method: "PUT" });
	check(
		"the signed URL accepts the bytes without a key",
		put.ok,
		await put.text()
	);
	const otherItem = await fetch(
		early.parts[0].url.replace(started.id, big.id),
		{ body: small, method: "PUT" }
	);
	check("a part URL only works for its own upload", otherItem.status === 401);
	const completed = await mcp(mcpKey, "complete_drive_upload", {
		id: started.id,
	});
	check(
		"complete_drive_upload creates the file",
		completed.complete === true && completed.item.size === small.length,
		completed
	);
	const link = await mcp(mcpKey, "get_drive_download_url", {
		id: completed.item.id,
	});
	const fetched = await fetch(link.url);
	check(
		"the signed download URL returns the same bytes",
		sha(Buffer.from(await fetched.arrayBuffer())) === sha(small)
	);
	const item = await mcp(mcpKey, "get_drive_item", { id: completed.item.id });
	check(
		"get_drive_item returns the path",
		item.path?.at(-1)?.name === "mcp.mp4" && item.sharing,
		item
	);
	await mcp(mcpKey, "rename_drive_item", {
		id: completed.item.id,
		name: "m.mp4",
	});
	const sharing = await mcp(mcpKey, "share_drive_item", {
		id: completed.item.id,
		link: true,
	});
	check("share_drive_item turns the link on", !!sharing.linkUrl, sharing);
	const searched = await mcp(mcpKey, "list_drive_items", { query: "m.mp4" });
	check(
		"list_drive_items searches by name",
		searched.items?.some((entry) => entry.id === completed.item.id),
		searched
	);
	const cancelled = await mcp(mcpKey, "start_drive_upload", {
		name: "never.bin",
		size: 10,
	});
	const cancel = await mcp(mcpKey, "cancel_drive_upload", { id: cancelled.id });
	check("cancel_drive_upload", cancel.ok === true, cancel);

	console.log("\nCleanup");
	const { item: top } = await cli(driveKey, "info", folder);
	await cli(driveKey, "rm", top.id, "--forever");
	const gone = await cli(driveKey, "info", top.id);
	check("rm --forever deletes the folder and its contents", !!gone.error, gone);
} finally {
	await rm(dir, { force: true, recursive: true });
	for (const id of minted) {
		await fetch(`${BASE}/api/api-keys?id=${encodeURIComponent(id)}`, {
			headers: { Cookie: cookie, Origin: BASE },
			method: "DELETE",
		});
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
