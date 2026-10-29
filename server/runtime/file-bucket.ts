import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { FileObject } from "./file-object";
import type { StoredMeta } from "./file-object";

const { createReadStream, createWriteStream } = fs;
const { mkdir, readFile, rm, stat, writeFile } = fsPromises;
const { dirname, join, resolve, sep } = nodePath;

/**
 * The R2 bucket API over a directory. Objects are files under `root`; the
 * HTTP and custom metadata R2 would keep ride in a `.meta.json` sidecar.
 * Covers what the app uses: get (with a byte range), put, delete, head, and multipart uploads.
 */
function assertInside(root: string, path: string) {
	const full = resolve(path);
	if (full !== root && !full.startsWith(root + sep)) {
		throw new Error("Object key escapes the bucket root");
	}
	return full;
}

export class FileBucket {
	private readonly root: string;

	constructor(root: string) {
		this.root = resolve(root);
	}

	private pathFor(key: string) {
		return assertInside(this.root, join(this.root, key));
	}

	private async readMeta(key: string): Promise<StoredMeta | null> {
		try {
			return JSON.parse(
				await readFile(`${this.pathFor(key)}.meta.json`, "utf-8")
			) as StoredMeta;
		} catch {
			try {
				const info = await stat(this.pathFor(key));
				return {
					etag: String(info.mtimeMs),
					size: info.size,
					uploaded: info.mtime.toISOString(),
				};
			} catch {
				return null;
			}
		}
	}

	async get(
		key: string,
		options?: { range?: { offset?: number; length?: number; suffix?: number } }
	) {
		const meta = await this.readMeta(key);
		if (!meta) {
			return null;
		}
		let range: { offset: number; length: number } | undefined;
		if (options?.range) {
			const offset =
				options.range.suffix === null || options.range.suffix === undefined
					? (options.range.offset ?? 0)
					: Math.max(meta.size - options.range.suffix, 0);
			const length = Math.min(
				options.range.length ?? meta.size - offset,
				meta.size - offset
			);
			range = { length, offset };
		}
		return new FileObject(key, this.pathFor(key), meta, range);
	}

	async head(key: string) {
		const meta = await this.readMeta(key);
		return meta ? new FileObject(key, this.pathFor(key), meta) : null;
	}

	async put(
		key: string,
		value:
			| ArrayBuffer
			| ArrayBufferView
			| string
			| ReadableStream
			| Blob
			| null,
		options?: {
			httpMetadata?: StoredMeta["httpMetadata"] | Headers;
			customMetadata?: Record<string, string>;
		}
	) {
		const path = this.pathFor(key);
		await mkdir(dirname(path), { recursive: true });
		let buffer: Buffer;
		if (value === null) {
			buffer = Buffer.alloc(0);
		} else if (typeof value === "string") {
			buffer = Buffer.from(value);
		} else if (value instanceof ArrayBuffer) {
			buffer = Buffer.from(value);
		} else if (ArrayBuffer.isView(value)) {
			buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
		} else if (value instanceof Blob) {
			buffer = Buffer.from(await value.arrayBuffer());
		} else {
			buffer = Buffer.from(await new Response(value).arrayBuffer());
		}
		const httpMetadata =
			options?.httpMetadata instanceof Headers
				? { contentType: options.httpMetadata.get("content-type") ?? undefined }
				: options?.httpMetadata;
		const meta: StoredMeta = {
			customMetadata: options?.customMetadata,
			etag: `${Date.now().toString(16)}-${buffer.byteLength.toString(16)}`,
			httpMetadata,
			size: buffer.byteLength,
			uploaded: new Date().toISOString(),
		};
		await writeFile(path, buffer);
		await writeFile(`${path}.meta.json`, JSON.stringify(meta));
		return new FileObject(key, path, meta);
	}

	private multipartDirectory(uploadId: string) {
		if (!/^[\w-]+$/u.test(uploadId)) {
			throw new Error("Invalid multipart upload id");
		}
		return join(this.root, ".multipart", uploadId);
	}

	async createMultipartUpload(
		key: string,
		options?: { httpMetadata?: StoredMeta["httpMetadata"] }
	) {
		const uploadId = randomUUID();
		await mkdir(this.multipartDirectory(uploadId), { recursive: true });
		await writeFile(
			join(this.multipartDirectory(uploadId), "meta.json"),
			JSON.stringify(options?.httpMetadata ?? {})
		);
		return this.resumeMultipartUpload(key, uploadId);
	}

	resumeMultipartUpload(key: string, uploadId: string) {
		const directory = this.multipartDirectory(uploadId);
		const partPath = (partNumber: number) =>
			join(directory, `part-${partNumber}`);
		return {
			abort: async () => {
				await rm(directory, { force: true, recursive: true });
			},
			complete: async (parts: { partNumber: number; etag: string }[]) => {
				const path = this.pathFor(key);
				await mkdir(dirname(path), { recursive: true });
				const out = createWriteStream(path);
				try {
					for (const part of [...parts].toSorted(
						(a, b) => a.partNumber - b.partNumber
					)) {
						await pipeline(createReadStream(partPath(part.partNumber)), out, {
							end: false,
						});
					}
				} finally {
					out.end();
				}
				await once(out, "close");
				const httpMetadata = JSON.parse(
					await readFile(join(directory, "meta.json"), "utf-8")
				) as StoredMeta["httpMetadata"];
				const { size } = await stat(path);
				const meta: StoredMeta = {
					etag: `${Date.now().toString(16)}-${size.toString(16)}`,
					httpMetadata,
					size,
					uploaded: new Date().toISOString(),
				};
				await writeFile(`${path}.meta.json`, JSON.stringify(meta));
				await rm(directory, { force: true, recursive: true });
				return new FileObject(key, path, meta);
			},
			key,
			uploadId,
			uploadPart: async (
				partNumber: number,
				value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob
			) => {
				if (!Number.isInteger(partNumber) || partNumber < 1) {
					throw new Error("Invalid part number");
				}
				let source: Readable;
				if (value instanceof ReadableStream) {
					source = Readable.fromWeb(value as never);
				} else {
					let bytes: ArrayBuffer | string;
					if (value instanceof Blob) {
						bytes = await value.arrayBuffer();
					} else if (
						typeof value === "string" ||
						value instanceof ArrayBuffer
					) {
						bytes = value;
					} else {
						bytes = value.buffer as ArrayBuffer;
					}
					source = Readable.from(Buffer.from(bytes as ArrayBuffer));
				}
				await pipeline(source, createWriteStream(partPath(partNumber)));
				const { size } = await stat(partPath(partNumber));
				return { etag: `${partNumber}-${size.toString(16)}`, partNumber };
			},
		};
	}

	async delete(keys: string | string[]) {
		for (const key of Array.isArray(keys) ? keys : [keys]) {
			const path = this.pathFor(key);
			await rm(path, { force: true });
			await rm(`${path}.meta.json`, { force: true });
		}
	}

	// oxlint-disable-next-line eslint/class-methods-use-this -- R2Bucket requires list on the bucket instance, including this unsupported-operation implementation.
	list = () => {
		try {
			throw new Error("FileBucket.list is not implemented");
		} catch (error) {
			return Promise.reject(error);
		}
	};
}

export function openFileBucket(root: string): R2Bucket {
	return new FileBucket(root) as unknown as R2Bucket;
}
