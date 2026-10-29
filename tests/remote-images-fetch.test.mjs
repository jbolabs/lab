import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { deferredPromise } from "./helpers/deferred.mjs";

const { mkdtempSync, rmSync } = fs;
const { tmpdir } = os;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-remote-images-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

await build({
	bundle: true,
	entryPoints: [join(root, "src/lib/remote-images/fetch.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: join(outDir, "fetch.mjs"),
	platform: "node",
	target: "node22",
});

await build({
	alias: { "@": join(root, "src") },
	bundle: true,
	entryPoints: [join(root, "src/app/api/remote-images/route.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: join(outDir, "route.mjs"),
	platform: "node",
	plugins: [
		{
			name: "remote-image-route-stubs",
			setup(esbuild) {
				const stubs = new Map([
					[
						"@/lib/api/auth",
						"export async function requireSessionUser() { return globalThis.remoteImageTestAuthenticated === false ? { user: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) } : { user: { id: 'u' }, error: null }; }",
					],
					["@/lib/cloudflare", "export function getEnv() { return {}; }"],
					[
						"@/lib/runtime",
						"export function isNodeRuntime() { return false; }",
					],
				]);
				esbuild.onResolve(
					{ filter: /^@\/lib\/(?:api\/auth|cloudflare|runtime)$/ },
					(args) => ({ namespace: "route-stub", path: args.path })
				);
				esbuild.onLoad({ filter: /.*/, namespace: "route-stub" }, (args) => ({
					contents: stubs.get(args.path),
					loader: "js",
				}));
			},
		},
	],
	target: "node22",
});

const { fetchRemoteImage, parseRemoteImageUrl, RemoteImageError } =
	await import(pathToFileURL(join(outDir, "fetch.mjs")).href);
const { GET } = await import(pathToFileURL(join(outDir, "route.mjs")).href);

const png = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

test("the route requires a session before any outbound fetch", async (t) => {
	globalThis.remoteImageTestAuthenticated = false;
	t.after(() => {
		delete globalThis.remoteImageTestAuthenticated;
	});
	let calls = 0;
	t.mock.method(globalThis, "fetch", () => {
		try {
			calls += 1;
			return Promise.resolve(
				new Response(png, { headers: { "Content-Type": "image/png" } })
			);
		} catch (error) {
			return Promise.reject(error);
		}
	});
	const response = await GET(
		new Request(
			"https://mail.example/api/remote-images?url=https%3A%2F%2Fimages.example%2Fphoto.png"
		)
	);
	assert.equal(response.status, 401);
	assert.equal(calls, 0);
});

test("a valid image ignores restrictive upstream response headers", async () => {
	const calls = [];
	const result = await fetchRemoteImage("https://images.example/photo.png", {
		fetch: (url, init) => {
			try {
				calls.push({ init, url: url.href });
				return Promise.resolve(
					new Response(png, {
						headers: {
							"Content-Type": "image/png",
							"Cross-Origin-Resource-Policy": "same-origin",
						},
					})
				);
			} catch (error) {
				return Promise.reject(error);
			}
		},
	});
	assert.equal(result.contentType, "image/png");
	assert.deepEqual(result.body, png);
	assert.equal("headers" in result, false);
	assert.equal(calls[0].init.redirect, "manual");
	assert.equal(new Headers(calls[0].init.headers).has("cookie"), false);
	assert.equal(new Headers(calls[0].init.headers).has("authorization"), false);
});

test("the authenticated route replaces upstream CORP with locally usable safe headers", async (t) => {
	t.mock.method(globalThis, "fetch", () =>
		Promise.resolve(
			new Response(png, {
				headers: {
					"Content-Type": "image/png",
					"Cross-Origin-Resource-Policy": "same-origin",
					"Set-Cookie": "upstream=secret",
				},
			})
		)
	);
	const response = await GET(
		new Request(
			"https://mail.example/api/remote-images?url=https%3A%2F%2Fimages.example%2Fphoto.png"
		)
	);
	assert.equal(response.status, 200);
	assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
	assert.equal(response.headers.get("Content-Type"), "image/png");
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.equal(
		response.headers.get("Cross-Origin-Resource-Policy"),
		"same-origin"
	);
	assert.equal(
		response.headers.get("Content-Security-Policy"),
		"default-src 'none'; sandbox"
	);
	assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
	assert.equal(response.headers.has("Set-Cookie"), false);
});

test("the route rejects a missing or invalid url query before outbound fetch", async (t) => {
	let calls = 0;
	t.mock.method(globalThis, "fetch", () => {
		try {
			calls += 1;
			return Promise.resolve(
				new Response(png, { headers: { "Content-Type": "image/png" } })
			);
		} catch (error) {
			return Promise.reject(error);
		}
	});
	for (const requestUrl of [
		"https://mail.example/api/remote-images",
		"https://mail.example/api/remote-images?url=file%3A%2F%2F%2Fetc%2Fpasswd",
	]) {
		const response = await GET(new Request(requestUrl));
		assert.equal(response.status, 400);
	}
	assert.equal(calls, 0);
});

test("every redirect is validated and private redirect loops stop before another fetch", async () => {
	let calls = 0;
	await assert.rejects(
		fetchRemoteImage("https://images.example/start", {
			fetch: () => {
				try {
					calls += 1;
					return Promise.resolve(
						new Response(null, {
							headers: { Location: "http://127.0.0.1/private.png" },
							status: 302,
						})
					);
				} catch (error) {
					return Promise.reject(error);
				}
			},
		}),
		(error) =>
			error instanceof RemoteImageError &&
			error.code === "invalid_url" &&
			error.status === 400
	);
	assert.equal(calls, 1);
});

test("redirect count is capped", async () => {
	let calls = 0;
	await assert.rejects(
		fetchRemoteImage("https://images.example/loop", {
			fetch: (url) => {
				try {
					calls += 1;
					return Promise.resolve(
						new Response(null, {
							headers: { Location: url.href },
							status: 302,
						})
					);
				} catch (error) {
					return Promise.reject(error);
				}
			},
			maxRedirects: 3,
		}),
		(error) => error.code === "too_many_redirects"
	);
	assert.equal(calls, 4);
});

test("streaming size cap cancels a body that exceeds the limit", async () => {
	let cancelled = false;
	const body = new ReadableStream({
		cancel() {
			cancelled = true;
		},
		start(controller) {
			controller.enqueue(png);
			controller.enqueue(new Uint8Array(8));
		},
	});
	await assert.rejects(
		fetchRemoteImage("https://images.example/large.png", {
			fetch: () =>
				Promise.resolve(
					new Response(body, { headers: { "Content-Type": "image/png" } })
				),
			maxBytes: png.byteLength,
		}),
		(error) => error.code === "too_large" && error.status === 413
	);
	assert.equal(cancelled, true);
});

test("non-image MIME and spoofed image signatures are rejected", async () => {
	await assert.rejects(
		fetchRemoteImage("https://images.example/page", {
			fetch: () =>
				Promise.resolve(
					new Response("<html></html>", {
						headers: { "Content-Type": "text/html" },
					})
				),
		}),
		(error) => error.code === "unsupported_type" && error.status === 415
	);
	await assert.rejects(
		fetchRemoteImage("https://images.example/fake.png", {
			fetch: () =>
				Promise.resolve(
					new Response("<html></html>", {
						headers: { "Content-Type": "image/png" },
					})
				),
		}),
		(error) => error.code === "invalid_signature" && error.status === 415
	);
});

test("the total request timeout aborts an in-flight fetch", async () => {
	await assert.rejects(
		fetchRemoteImage("https://images.example/slow.png", {
			fetch: (_url, init) =>
				Promise.resolve(
					deferredPromise((_resolve, reject) => {
						init.signal.addEventListener(
							"abort",
							() => reject(init.signal.reason),
							{ once: true }
						);
					})
				),
			timeoutMs: 10,
		}),
		(error) => error.code === "timeout" && error.status === 504
	);
});

test("the total request timeout also covers a body that stalls after headers", async () => {
	await assert.rejects(
		fetchRemoteImage("https://images.example/slow-body.png", {
			fetch: (_url, init) =>
				Promise.resolve(
					new Response(
						new ReadableStream({
							start(controller) {
								init.signal.addEventListener(
									"abort",
									() => controller.error(init.signal.reason),
									{ once: true }
								);
							},
						}),
						{ headers: { "Content-Type": "image/png" } }
					)
				),
			timeoutMs: 10,
		}),
		(error) => error.code === "timeout" && error.status === 504
	);
});

test("invalid query targets are rejected before fetch", () => {
	for (const value of [
		"",
		"not a url",
		"file:///etc/passwd",
		"https://user:secret@example.com/a.png",
		"https://example.com:8443/a.png",
		"http://localhost/a.png",
		"http://service.internal/a.png",
		"http://router.home.arpa/a.png",
		"http://127.1/a.png",
		"http://[::1]/a.png",
		"https://mail.example/api/remote-images?url=x",
	]) {
		assert.throws(
			() => parseRemoteImageUrl(value, ["https://mail.example"]),
			(error) => error.code === "invalid_url" && error.status === 400,
			value
		);
	}
	assert.throws(
		() => parseRemoteImageUrl(`https://example.com/${"a".repeat(4096)}`),
		/Invalid remote image URL/u
	);
});
