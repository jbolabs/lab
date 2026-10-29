import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const project = join(import.meta.dirname, "..");
const temporary = mkdtempSync(
	join(project, "node_modules", "remote-route-test-")
);
after(() => {
	rmSync(temporary, { force: true, recursive: true });
	delete globalThis.proxyAuth;
	delete globalThis.proxyEnv;
	delete globalThis.proxyFetch;
});
const mocks = {
	"@/lib/api/auth":
		"export async function requireSessionUser(){return globalThis.proxyAuth}",
	"@/lib/cloudflare": "export function getEnv(){return globalThis.proxyEnv}",
	"@/lib/remote-images/fetch":
		"export class RemoteImageError extends Error { constructor(message,status){super(message);this.status=status} } export function fetchRemoteImage(...args){return globalThis.proxyFetch(...args)}",
};
await build({
	alias: { "@": join(project, "src") },
	bundle: true,
	entryPoints: [join(project, "src/app/api/remote-images/route.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: join(temporary, "route.mjs"),
	packages: "external",
	platform: "node",
	plugins: [
		{
			name: "route-fixtures",
			setup(builder) {
				builder.onResolve(
					{ filter: /^@\/lib\/(?:cloudflare|api\/auth|remote-images\/fetch)$/ },
					(args) => ({ namespace: "mock", path: args.path })
				);
				builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
					contents: mocks[args.path],
					loader: "js",
				}));
			},
		},
	],
});
const { GET } = await import(pathToFileURL(join(temporary, "route.mjs")).href);
const request = () =>
	new Request(
		"https://mail.example/api/remote-images?url=https%3A%2F%2Fcdn.example%2Flogo.png"
	);

test("unauthenticated and self-hosted requests never make outbound proxy requests", async () => {
	globalThis.proxyEnv = {};
	globalThis.proxyFetch = () => {
		throw new Error("Unexpected outbound request");
	};
	globalThis.proxyAuth = {
		error: Response.json({ error: "Unauthorized" }, { status: 401 }),
	};
	const awaitedValue1 = await GET(request());
	assert.equal(awaitedValue1.status, 401);
	globalThis.proxyAuth = { error: null, user: { id: "user" } };
	globalThis.proxyEnv = { MAILFLARE_RUNTIME: "node" };
	const awaitedValue2 = await GET(request());
	assert.equal(awaitedValue2.status, 503);
});

test("authenticated Worker responses use private image headers and block the app origin", async () => {
	globalThis.proxyAuth = { error: null, user: { id: "user" } };
	globalThis.proxyEnv = {};
	globalThis.proxyFetch = (url, options) => {
		try {
			assert.equal(url, "https://cdn.example/logo.png");
			assert.deepEqual(options.blockedOrigins, ["https://mail.example"]);
			return Promise.resolve({
				body: new Uint8Array([1, 2, 3]),
				contentType: "image/png",
			});
		} catch (error) {
			return Promise.reject(error);
		}
	};
	const response = await GET(request());
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.equal(
		response.headers.get("Cross-Origin-Resource-Policy"),
		"same-origin"
	);
	assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
	assert.equal(response.headers.get("Content-Type"), "image/png");
	assert.deepEqual(
		[...new Uint8Array(await response.arrayBuffer())],
		[1, 2, 3]
	);
});
