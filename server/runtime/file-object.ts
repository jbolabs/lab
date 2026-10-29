import { createReadStream } from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable } from "node:stream";

const { readFile } = fsPromises;
export interface StoredMeta {
	httpMetadata?: {
		contentType?: string;
		contentDisposition?: string;
		cacheControl?: string;
	};
	customMetadata?: Record<string, string>;
	size: number;
	uploaded: string;
	etag: string;
}

export class FileObject {
	readonly key: string;
	private readonly path: string;
	private readonly meta: StoredMeta;
	private readonly range: { offset: number; length: number } | undefined;
	constructor(
		key: string,
		path: string,
		meta: StoredMeta,
		range?: { offset: number; length: number }
	) {
		this.key = key;
		this.path = path;
		this.meta = meta;
		this.range = range;
	}

	get size() {
		return this.meta.size;
	}
	get etag() {
		return this.meta.etag;
	}
	get httpEtag() {
		return `"${this.meta.etag}"`;
	}
	get uploaded() {
		return new Date(this.meta.uploaded);
	}
	get httpMetadata() {
		return this.meta.httpMetadata ?? {};
	}
	get customMetadata() {
		return this.meta.customMetadata ?? {};
	}
	get version() {
		return this.meta.etag;
	}
	get body(): ReadableStream<Uint8Array> {
		const options = this.range
			? {
					end: this.range.offset + this.range.length - 1,
					start: this.range.offset,
				}
			: undefined;
		return Readable.toWeb(
			createReadStream(this.path, options)
		) as ReadableStream<Uint8Array>;
	}
	readonly bodyUsed = false;
	async arrayBuffer(): Promise<ArrayBuffer> {
		const buffer = await readFile(this.path);
		const slice = this.range
			? buffer.subarray(
					this.range.offset,
					this.range.offset + this.range.length
				)
			: buffer;
		return slice.buffer.slice(
			slice.byteOffset,
			slice.byteOffset + slice.byteLength
		) as ArrayBuffer;
	}
	async text(): Promise<string> {
		return Buffer.from(await this.arrayBuffer()).toString("utf-8");
	}
	async json<T>(): Promise<T> {
		return JSON.parse(await this.text()) as T;
	}
	async blob(): Promise<Blob> {
		return new Blob([await this.arrayBuffer()], {
			type: this.meta.httpMetadata?.contentType,
		});
	}
	writeHttpMetadata(headers: Headers) {
		if (this.meta.httpMetadata?.contentType) {
			headers.set("Content-Type", this.meta.httpMetadata.contentType);
		}
		if (this.meta.httpMetadata?.contentDisposition) {
			headers.set(
				"Content-Disposition",
				this.meta.httpMetadata.contentDisposition
			);
		}
		if (this.meta.httpMetadata?.cacheControl) {
			headers.set("Cache-Control", this.meta.httpMetadata.cacheControl);
		}
	}
}
