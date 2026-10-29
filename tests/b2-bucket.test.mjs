import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
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
const outDir = mkdtempSync(join(tmpdir(), "mailflare-b2-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

async function bundle(entry, outfile) {
	await build({
		alias: { "@": join(root, "src") },
		bundle: true,
		entryPoints: [join(root, entry)],
		format: "esm",
		logLevel: "silent",
		outfile: join(outDir, outfile),
		platform: "node",
		target: "node22",
	});
	return import(pathToFileURL(join(outDir, outfile)).href);
}

const { getB2Config, getS3Config, describeB2Problem } = await bundle(
	"src/lib/storage/b2-config.ts",
	"config.mjs"
);
const { B2Bucket } = await bundle("src/lib/storage/b2-bucket.ts", "bucket.mjs");
const { withStorage } = await bundle("src/lib/storage/index.ts", "index.mjs");

test("getB2Config needs all four variables and a backblaze endpoint", () => {
	assert.equal(getB2Config({}), null);
	assert.equal(
		getB2Config({
			B2_APPLICATION_KEY: "s",
			B2_BUCKET: "b",
			B2_ENDPOINT: "example.com",
			B2_KEY_ID: "k",
		}),
		null
	);
	const config = getB2Config({
		B2_APPLICATION_KEY: "s",
		B2_BUCKET: "b",
		B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com/",
		B2_KEY_ID: "k",
	});
	assert.equal(config?.region, "us-west-004");
	assert.equal(config?.endpoint, "s3.us-west-004.backblazeb2.com");
	assert.match(describeB2Problem({ B2_KEY_ID: "k" }), /together/u);
	assert.equal(describeB2Problem({}), null);
});

test("withStorage swaps BUCKET only when B2 is configured", () => {
	const plain = { BUCKET: "r2", DB: "d1" };
	assert.equal(withStorage(plain), plain);
	const configured = {
		B2_APPLICATION_KEY: "s",
		B2_BUCKET: "b",
		B2_ENDPOINT: "s3.us-west-004.backblazeb2.com",
		B2_KEY_ID: "k",
		BUCKET: "r2",
		DB: "d1",
	};
	const env = withStorage(configured);
	assert.equal(env.DB, "d1");
	assert.notEqual(env.BUCKET, "r2");
	assert.equal(withStorage(env), env);
});

test("B2Bucket speaks S3: put, get, range, head, delete, multipart", async () => {
	const objects = new Map();
	const uploads = new Map();
	const requests = [];
	const server = createServer(async (req, res) => {
		const chunks = [];
		for await (const chunk of req) {
			chunks.push(chunk);
		}
		const body = Buffer.concat(chunks);
		const url = new URL(req.url, "http://x");
		const key = decodeURIComponent(url.pathname.slice(1));
		requests.push({
			auth: req.headers.authorization,
			host: req.headers["x-orig-host"],
			key,
			method: req.method,
		});
		const send = (status, payload = "", headers = {}) => {
			res.writeHead(status, headers);
			res.end(payload);
		};
		if (req.method === "POST" && url.searchParams.has("uploads")) {
			uploads.set("u1", {
				parts: new Map(),
				type: req.headers["content-type"],
			});
			return send(
				200,
				"<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>"
			);
		}
		if (req.method === "PUT" && url.searchParams.has("partNumber")) {
			uploads
				.get("u1")
				.parts.set(Number(url.searchParams.get("partNumber")), body);
			return send(200, "", {
				ETag: `"etag-${url.searchParams.get("partNumber")}"`,
			});
		}
		if (req.method === "POST" && url.searchParams.has("uploadId")) {
			const parts = [...uploads.get("u1").parts.entries()]
				.toSorted(([a], [b]) => a - b)
				.map(([, value]) => value);
			objects.set(key, {
				body: Buffer.concat(parts),
				type: uploads.get("u1").type,
			});
			return send(
				200,
				"<CompleteMultipartUploadResult></CompleteMultipartUploadResult>"
			);
		}
		if (req.method === "DELETE" && url.searchParams.has("uploadId")) {
			uploads.delete("u1");
			return send(204);
		}
		if (req.method === "PUT") {
			objects.set(key, {
				body,
				meta: req.headers["x-amz-meta-note"],
				type: req.headers["content-type"],
			});
			return send(200, "", { ETag: '"abc"' });
		}
		if (req.method === "DELETE") {
			objects.delete(key);
			return send(204);
		}
		const object = objects.get(key);
		if (!object) {
			return send(
				404,
				"<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>"
			);
		}
		const headers = {
			"Content-Type": object.type ?? "application/octet-stream",
			ETag: '"abc"',
			"Last-Modified": new Date().toUTCString(),
			...(object.meta ? { "x-amz-meta-note": object.meta } : {}),
		};
		if (req.method === "HEAD") {
			return send(200, "", {
				...headers,
				"Content-Length": String(object.body.length),
			});
		}
		const range = /bytes=(?<capture1>\d+)-(?<capture2>\d+)/u.exec(
			req.headers.range ?? ""
		);
		if (range) {
			return send(
				206,
				object.body.subarray(Number(range[1]), Number(range[2]) + 1),
				{
					...headers,
					"Content-Range": `bytes ${range[1]}-${range[2]}/${object.body.length}`,
				}
			);
		}
		return send(200, object.body, {
			...headers,
			"Content-Length": String(object.body.length),
		});
	});
	await deferredPromise((_resolve) => {
		server.listen(0, "127.0.0.1", _resolve);
	});
	const origFetch = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		const url = new URL(
			typeof input === "string" ? input : (input.href ?? input.url)
		);
		const target = new URL(
			url.pathname + url.search,
			`http://127.0.0.1:${server.address().port}`
		);
		return origFetch(target, {
			...init,
			headers: { ...init?.headers, "x-orig-host": url.host },
		});
	};
	try {
		const bucket = new B2Bucket({
			applicationKey: "s",
			bucket: "mail",
			endpoint: "s3.us-west-004.backblazeb2.com",
			keyId: "k",
			region: "us-west-004",
		});

		const put = await bucket.put("raw/a b.eml", "hello world", {
			customMetadata: { note: "hi" },
			httpMetadata: { contentType: "message/rfc822" },
		});
		assert.equal(put.size, 11);
		const got = await bucket.get("raw/a b.eml");
		assert.equal(await got.text(), "hello world");
		assert.equal(got.size, 11);
		assert.equal(got.httpMetadata.contentType, "message/rfc822");
		assert.equal(got.customMetadata.note, "hi");
		assert.match(
			requests[0].auth,
			/^AWS4-HMAC-SHA256 Credential=k\/\d{8}\/us-west-004\/s3\/aws4_request/u
		);
		assert.equal(requests[0].host, "mail.s3.us-west-004.backblazeb2.com");

		const ranged = await bucket.get("raw/a b.eml", {
			range: { length: 5, offset: 6 },
		});
		assert.equal(await ranged.text(), "world");
		assert.equal(ranged.size, 11);

		assert.equal(await bucket.get("missing"), null);
		const awaitedValue1 = await bucket.head("raw/a b.eml");
		assert.equal(awaitedValue1.size, 11);
		assert.equal(await bucket.head("missing"), null);

		await bucket.delete(["raw/a b.eml", "never-existed"]);
		assert.equal(await bucket.get("raw/a b.eml"), null);

		const upload = await bucket.createMultipartUpload("drive/big", {
			httpMetadata: { contentType: "video/mp4" },
		});
		const p1 = await upload.uploadPart(1, new Uint8Array([1, 2, 3]));
		const p2 = await upload.uploadPart(2, new Uint8Array([4, 5]));
		assert.equal(p1.etag, "etag-1");
		const done = await bucket
			.resumeMultipartUpload("drive/big", upload.uploadId)
			.complete([p2, p1]);
		assert.equal(done.size, 5);
		const awaitedValue2 = await bucket.get("drive/big");
		assert.deepEqual(
			[...Buffer.from(await awaitedValue2.arrayBuffer())],
			[1, 2, 3, 4, 5]
		);
		await bucket.createMultipartUpload("drive/other").then((u) => u.abort());
	} finally {
		globalThis.fetch = origFetch;
		server.close();
	}
});

test("AWS S3 config uses S3_* with AWS_* credential fallback, and B2 wins", () => {
	assert.equal(getS3Config({ S3_BUCKET: "b", S3_REGION: "us-east-1" }), null);
	const config = getS3Config({
		AWS_ACCESS_KEY_ID: "AK",
		AWS_SECRET_ACCESS_KEY: "sk",
		S3_BUCKET: "b",
		S3_REGION: "eu-west-2",
	});
	assert.deepEqual(config, {
		applicationKey: "sk",
		bucket: "b",
		endpoint: "s3.eu-west-2.amazonaws.com",
		keyId: "AK",
		region: "eu-west-2",
	});
	assert.equal(
		getS3Config({
			S3_ACCESS_KEY_ID: "a",
			S3_BUCKET: "b",
			S3_REGION: "nope",
			S3_SECRET_ACCESS_KEY: "b",
		}),
		null
	);
	assert.match(describeB2Problem({ S3_BUCKET: "b" }), /AWS S3 needs/u);
	const both = withStorage({
		BUCKET: "r2",
		S3_ACCESS_KEY_ID: "a",
		S3_BUCKET: "b",
		S3_REGION: "us-east-1",
		S3_SECRET_ACCESS_KEY: "s",
	});
	assert.notEqual(both.BUCKET, "r2");
});
