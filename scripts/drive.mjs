#!/usr/bin/env node
/**
 * Lab Drive from the command line, authenticated with an API key instead of a browser.
 *
 *   LAB_URL=https://lab.example.com LAB_API_KEY=ep_… node scripts/drive.mjs ls
 *
 * Create the key under Settings → API keys with "Read Drive" and "Manage Drive". No dependencies, Node 20+.
 * Run with no arguments for usage.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const USAGE = `Usage: node scripts/drive.mjs <command> [options]

  ls [folder]                    List My Drive or a folder (--shared, --trash, --search <text>)
  info <item>                    Show an item's details, path and sharing
  upload <file…> [--to folder]   Upload files of any size; rerun to resume
  download <file> [dest|-]       Download to dest (a file or folder), or - for stdout; rerun to resume
  mkdir <path>                   Create a folder and any missing parents
  mv <item…> <folder>            Move items into a folder (/ for My Drive)
  rename <item> <name>           Rename an item
  rm <item…> [--forever]         Move to trash; --forever deletes permanently
  restore <item…>                Restore from trash
  share <item> [email]           Show sharing, or share (--role view|edit|none, --link on|off)
  usage                          Storage used and the limit

Items are ids (drv_…) or paths in My Drive such as /Videos/demo.mp4.
Options: --json for machine-readable output, --url (LAB_URL), --key (LAB_API_KEY).`;

const RETRIES = 3;

const TYPES = {
	".csv": "text/csv",
	".gif": "image/gif",
	".html": "text/html",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".json": "application/json",
	".m4a": "audio/mp4",
	".md": "text/markdown",
	".mov": "video/quicktime",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".pdf": "application/pdf",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain",
	".wav": "audio/wav",
	".webm": "video/webm",
	".webp": "image/webp",
	".zip": "application/zip",
};

class CliError extends Error {
	name = "CliError";
}

const { values: options, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		forever: { type: "boolean" },
		help: { short: "h", type: "boolean" },
		json: { type: "boolean" },
		key: { type: "string" },
		link: { type: "string" },
		role: { type: "string" },
		search: { type: "string" },
		shared: { type: "boolean" },
		to: { type: "string" },
		trash: { type: "boolean" },
		url: { type: "string" },
	},
	strict: true,
});
const [command, ...args] = positionals;
const base = (options.url ?? process.env.LAB_URL ?? "http://localhost:3000")
	.trim()
	.replace(/\/+$/u, "");
const apiKey = options.key ?? process.env.LAB_API_KEY ?? "";
const showProgress = !options.json && process.stderr.isTTY;

function formatSize(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function progress(label, done, total) {
	if (showProgress) {
		const percent = total ? Math.floor((done / total) * 100) : 100;
		process.stderr.write(
			`\r${label}  ${percent}%  ${formatSize(done)} / ${formatSize(total)}\u001B[K`
		);
	}
}

function progressDone() {
	if (showProgress) {
		process.stderr.write("\n");
	}
}

/**
 * Passes chunks through, reporting each one's size.
 * @yields {Uint8Array} each chunk, unchanged
 */
async function* counted(source, onBytes) {
	for await (const chunk of source) {
		onBytes(chunk.length);
		yield chunk;
	}
}

async function request(route, init = {}) {
	if (!apiKey) {
		throw new CliError(
			"Set LAB_API_KEY (or --key) to an API key with the drive:read and drive:write scopes"
		);
	}
	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${apiKey}`);
	if (init.json !== undefined) {
		headers.set("Content-Type", "application/json");
	}
	const response = await fetch(`${base}${route}`, {
		...init,
		body: init.json === undefined ? init.body : JSON.stringify(init.json),
		headers,
	});
	if (!response.ok) {
		const data = await response.json().catch(() => null);
		throw new CliError(
			data?.error ??
				`${init.method ?? "GET"} ${route} failed (${response.status})`
		);
	}
	return response;
}

async function api(route, init) {
	const response = await request(route, init);
	return response.json();
}

async function withRetries(run) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			// A refusal from the server will not change on retry; a dropped connection might.
			if (error instanceof CliError || attempt >= RETRIES) {
				throw error;
			}
			await sleep(1000 * 2 ** attempt);
		}
	}
}

const itemRoute = (id, suffix = "") =>
	`/api/drive/items/${encodeURIComponent(id)}${suffix}`;

function listFolder(id, query = {}) {
	const params = new URLSearchParams(id ? { parent: id } : query);
	return api(`/api/drive/items?${params}`);
}

async function createFolder(name, parent) {
	const created = await api("/api/drive/items", {
		json: { name, parentId: parent?.id ?? null },
		method: "POST",
	});
	return created.item;
}

/** Resolves `drv_…`, `/`, or a path in My Drive to an item; `null` stands for My Drive itself. */
async function resolve(ref, { create = false } = {}) {
	if (ref.startsWith("drv_")) {
		const details = await api(itemRoute(ref));
		return details.item;
	}
	let current = null;
	for (const name of ref.split("/").filter(Boolean)) {
		if (current && current.kind !== "folder") {
			throw new CliError(`${current.name} is not a folder`);
		}
		const { items } = await listFolder(current?.id);
		const matches = items.filter((item) => item.name === name);
		if (matches.length > 1) {
			throw new CliError(
				`Several items are named ${name}; use an id: ${matches.map((item) => item.id).join(", ")}`
			);
		}
		if (!matches.length && !create) {
			throw new CliError(`Not found: ${ref}`);
		}
		current = matches[0] ?? (await createFolder(name, current));
	}
	return current;
}

async function resolveFolder(ref, resolveOptions) {
	const folder = await resolve(ref, resolveOptions);
	if (folder && folder.kind !== "folder") {
		throw new CliError(`${folder.name} is not a folder`);
	}
	return folder;
}

function itemLine(item) {
	const size = item.kind === "folder" ? "-" : formatSize(item.size);
	const name = item.kind === "folder" ? `${item.name}/` : item.name;
	return `${size.padStart(8)}  ${name}  ${item.id}`;
}

/** Sends one part straight from disk; `onBytes` reports progress within it. */
async function putPart(file, uploadId, part, start, length, onBytes) {
	await request(
		`/api/drive/upload/${encodeURIComponent(uploadId)}?part=${part}`,
		{
			body: counted(
				createReadStream(file, { end: start + length - 1, start }),
				onBytes
			),
			duplex: "half",
			headers: {
				"Content-Length": String(length),
				"Content-Type": "application/octet-stream",
			},
			method: "PUT",
		}
	);
}

async function uploadFile(file, folder) {
	const info = await stat(file);
	if (!info.isFile()) {
		throw new CliError(`${file} is not a file`);
	}
	const name = path.basename(file);
	const started = await api("/api/drive/upload", {
		json: {
			contentType:
				TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream",
			// The web app uses the modification time too, so either can resume the other's upload.
			fingerprint: String(Math.floor(info.mtimeMs)),
			name,
			parentId: folder?.id ?? null,
			size: info.size,
		},
		method: "POST",
	});
	if (started.complete) {
		return started.item;
	}
	const done = new Set(started.uploaded);
	const partBytes = (part) =>
		Math.min(started.partSize, info.size - (part - 1) * started.partSize);
	let sent = [...done].reduce((sum, part) => sum + partBytes(part), 0);
	for (let part = 1; part <= started.parts; part += 1) {
		if (!done.has(part)) {
			const before = sent;
			await withRetries(() => {
				let partSent = 0;
				return putPart(
					file,
					started.id,
					part,
					(part - 1) * started.partSize,
					partBytes(part),
					(bytes) => {
						partSent += bytes;
						progress(name, before + partSent, info.size);
					}
				);
			});
			sent += partBytes(part);
		}
	}
	progressDone();
	const completed = await api(
		`/api/drive/upload/${encodeURIComponent(started.id)}`,
		{ method: "POST" }
	);
	return completed.item;
}

async function fileSize(file) {
	try {
		const info = await stat(file);
		return info.size;
	} catch {
		return 0;
	}
}

async function isDirectory(file) {
	try {
		const info = await stat(file);
		return info.isDirectory();
	} catch {
		return false;
	}
}

/** One download attempt into `partial`, continuing after `offset` bytes when the server still has the same file. */
async function fetchInto(item, partial, etagFile, etag) {
	const offset = etag ? await fileSize(partial) : 0;
	const response = await request(itemRoute(item.id, "/content?download=1"), {
		headers: offset ? { "If-Range": etag, Range: `bytes=${offset}-` } : {},
	});
	const resumed = response.status === 206;
	await writeFile(etagFile, response.headers.get("ETag") ?? "");
	let received = resumed ? offset : 0;
	await pipeline(
		counted(Readable.fromWeb(response.body), (bytes) => {
			received += bytes;
			progress(item.name, received, item.size);
		}),
		createWriteStream(partial, { flags: resumed ? "a" : "w" })
	);
	return response.headers.get("ETag") ?? "";
}

async function downloadFile(item, destination) {
	if (item.kind !== "file") {
		throw new CliError(`${item.name} is a folder`);
	}
	if (destination === "-") {
		const response = await request(itemRoute(item.id, "/content?download=1"));
		await pipeline(Readable.fromWeb(response.body), process.stdout);
		return null;
	}
	let target = destination ?? item.name;
	if (await isDirectory(target)) {
		target = path.join(target, item.name);
	}
	// A partial download keeps its ETag beside it; If-Range restarts it if the file changed since.
	const partial = `${target}.part`;
	const etagFile = `${partial}.etag`;
	let etag = (await fileSize(partial))
		? await readFile(etagFile, "utf-8").catch(() => "")
		: "";
	await withRetries(async () => {
		etag = await fetchInto(item, partial, etagFile, etag);
	});
	progressDone();
	await rename(partial, target);
	await rm(etagFile, { force: true });
	return target;
}

function bulk(action, ids, parentId) {
	return api("/api/drive/items/bulk", {
		json: { action, ids, parentId },
		method: "POST",
	});
}

function need(count, label) {
	if (args.length < count) {
		throw new CliError(`Usage: drive ${command} ${label}`);
	}
}

async function resolveAll(refs) {
	const items = [];
	for (const ref of refs) {
		items.push(await resolve(ref));
	}
	return items;
}

function listView() {
	if (options.trash) {
		return "trash";
	}
	return options.shared ? "shared" : "my";
}

async function share() {
	need(1, "<item> [email] [--role view|edit|none] [--link on|off]");
	const [ref, email] = args;
	const item = await resolve(ref);
	if (email && options.role === "none") {
		await api(
			itemRoute(item.id, `/shares?email=${encodeURIComponent(email)}`),
			{
				method: "DELETE",
			}
		);
	} else if (email) {
		await api(itemRoute(item.id, "/shares"), {
			json: { email, role: options.role === "edit" ? "edit" : "view" },
			method: "POST",
		});
	}
	if (options.link !== undefined) {
		if (!["on", "off"].includes(options.link)) {
			throw new CliError("--link takes on or off");
		}
		await api(itemRoute(item.id, "/link"), {
			json: { enabled: options.link === "on" },
			method: "POST",
		});
	}
	const sharing = await api(itemRoute(item.id, "/shares"));
	return {
		...sharing,
		linkUrl: sharing.linkToken ? `${base}/d/${sharing.linkToken}` : null,
	};
}

function printItems(result) {
	for (const item of result.items) {
		console.log(itemLine(item));
	}
}

function printCount(result) {
	console.log(`${result.count} item${result.count === 1 ? "" : "s"}`);
}

function printDetails(result) {
	if (result.path?.length) {
		console.log(`/${result.path.map((crumb) => crumb.name).join("/")}`);
	}
	if (result.item) {
		console.log(itemLine(result.item));
	}
	for (const entry of result.sharing?.shares ?? []) {
		console.log(`shared ${entry.role} with ${entry.email}`);
	}
	if (result.sharing?.linkToken) {
		console.log(`link   ${base}/d/${result.sharing.linkToken}`);
	}
}

/** Each command returns JSON-ready data; `print` renders it for people when --json is absent. */
const COMMANDS = {
	download: {
		print: (result) => console.log(`downloaded  ${result.path}`),
		async run() {
			need(1, "<file> [dest|-]");
			const item = await resolve(args[0]);
			const target = await downloadFile(item, args[1]);
			return target === null ? undefined : { item, path: target };
		},
	},
	info: {
		print: printDetails,
		async run() {
			need(1, "<item>");
			const item = await resolve(args[0]);
			if (!item) {
				return { item: null, path: [] };
			}
			const details = await api(itemRoute(item.id));
			if (details.item.role === "owner" && !details.item.trashedAt) {
				details.sharing = await api(itemRoute(item.id, "/shares"));
			}
			return details;
		},
	},
	ls: {
		print: printItems,
		async run() {
			if (options.trash || options.shared || options.search) {
				return listFolder(null, {
					...(options.search ? { q: options.search } : {}),
					view: listView(),
				});
			}
			const folder = args[0] ? await resolveFolder(args[0]) : null;
			return listFolder(folder?.id);
		},
	},
	mkdir: {
		print: printDetails,
		async run() {
			need(1, "<path>");
			return { item: await resolveFolder(args[0], { create: true }) };
		},
	},
	mv: {
		print: printCount,
		async run() {
			need(2, "<item…> <folder>");
			const folder = await resolveFolder(args.at(-1));
			const items = await resolveAll(args.slice(0, -1));
			return bulk(
				"move",
				items.map((item) => item.id),
				folder?.id ?? null
			);
		},
	},
	rename: {
		print: printDetails,
		async run() {
			need(2, "<item> <name>");
			const [ref, name] = args;
			const item = await resolve(ref);
			return api(itemRoute(item.id), { json: { name }, method: "PATCH" });
		},
	},
	restore: {
		print: printCount,
		run() {
			need(1, "<item…>");
			if (args.some((ref) => !ref.startsWith("drv_"))) {
				throw new CliError("Trashed items are restored by id; see ls --trash");
			}
			return bulk("restore", args);
		},
	},
	rm: {
		print: printCount,
		async run() {
			need(1, "<item…> [--forever]");
			const items = await resolveAll(args);
			const ids = items.map((item) => item.id);
			const trashed = await bulk("trash", ids);
			return options.forever ? bulk("delete", ids) : trashed;
		},
	},
	share: {
		print(result) {
			for (const entry of result.shares) {
				console.log(`${entry.role.padEnd(5)}  ${entry.email}`);
			}
			console.log(`link   ${result.linkUrl ?? "off"}`);
		},
		run: share,
	},
	upload: {
		print(result) {
			for (const item of result.items) {
				console.log(`uploaded  ${itemLine(item)}`);
			}
		},
		async run() {
			need(1, "<file…> [--to folder]");
			const folder = options.to
				? await resolveFolder(options.to, { create: true })
				: null;
			const items = [];
			for (const file of args) {
				items.push(await uploadFile(file, folder));
			}
			return { items };
		},
	},
	usage: {
		print(result) {
			const limit =
				result.storageLimit === null
					? ""
					: ` of ${formatSize(result.storageLimit)}`;
			console.log(`${formatSize(result.storageUsed)} used${limit}`);
		},
		async run() {
			const { storageUsed, storageLimit } = await listFolder(null);
			return { storageLimit, storageUsed };
		},
	},
};

const selected = Object.hasOwn(COMMANDS, command ?? "")
	? COMMANDS[command]
	: null;
if (!selected || options.help) {
	console.log(USAGE);
	process.exit(options.help || !command ? 0 : 1);
}
try {
	const result = await selected.run();
	if (result !== undefined) {
		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			selected.print(result);
		}
	}
} catch (error) {
	progressDone();
	const message = error instanceof Error ? error.message : String(error);
	if (options.json) {
		console.log(JSON.stringify({ error: message }));
	} else {
		console.error(message);
	}
	process.exitCode = 1;
}
