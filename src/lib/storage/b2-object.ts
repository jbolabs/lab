import type { B2HttpMetadata } from "./b2-types";

const META_PREFIX = "x-amz-meta-";

function readMetadata(headers: Headers): {
	httpMetadata: B2HttpMetadata;
	customMetadata: Record<string, string>;
} {
	const customMetadata: Record<string, string> = {};
	for (const [name, value] of headers) {
		if (name.startsWith(META_PREFIX)) {
			customMetadata[name.slice(META_PREFIX.length)] = value;
		}
	}
	return {
		customMetadata,
		httpMetadata: {
			cacheControl: headers.get("cache-control") ?? undefined,
			contentDisposition: headers.get("content-disposition") ?? undefined,
			contentType: headers.get("content-type") ?? undefined,
		},
	};
}

function objectSize(headers: Headers): number {
	const total = /\/(?<capture1>\d+)$/u.exec(
		headers.get("content-range") ?? ""
	)?.[1];
	return Number(total ?? headers.get("content-length") ?? 0);
}

export class B2Object {
	readonly key: string;
	private readonly response: Response;
	readonly size: number;
	readonly etag: string;
	readonly uploaded: Date;
	readonly httpMetadata: B2HttpMetadata;
	readonly customMetadata: Record<string, string>;

	constructor(key: string, response: Response, size?: number) {
		this.key = key;
		this.response = response;
		const { headers } = response;
		this.size = size ?? objectSize(headers);
		this.etag = (headers.get("etag") ?? "").replaceAll('"', "");
		this.uploaded = new Date(headers.get("last-modified") ?? Date.now());
		const meta = readMetadata(headers);
		this.httpMetadata = meta.httpMetadata;
		this.customMetadata = meta.customMetadata;
	}

	get httpEtag() {
		return `"${this.etag}"`;
	}
	get version() {
		return this.etag;
	}
	get body(): ReadableStream<Uint8Array> {
		return (this.response.body ??
			new Blob([]).stream()) as ReadableStream<Uint8Array>;
	}
	get bodyUsed() {
		return this.response.bodyUsed;
	}
	arrayBuffer() {
		return this.response.arrayBuffer();
	}
	text() {
		return this.response.text();
	}
	json<T>() {
		return this.response.json() as Promise<T>;
	}
	blob() {
		return this.response.blob();
	}

	writeHttpMetadata(headers: Headers) {
		if (this.httpMetadata.contentType) {
			headers.set("Content-Type", this.httpMetadata.contentType);
		}
		if (this.httpMetadata.contentDisposition) {
			headers.set("Content-Disposition", this.httpMetadata.contentDisposition);
		}
		if (this.httpMetadata.cacheControl) {
			headers.set("Cache-Control", this.httpMetadata.cacheControl);
		}
	}
}
