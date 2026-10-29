import type { AwsConfig } from "@/lib/aws/aws-types";
import { awsRequest, AwsError } from "@/lib/aws/client";
import { xmlTag } from "@/lib/aws/xml";
import type { B2Config, B2HttpMetadata } from "@/lib/storage/b2-types";

import { B2Object } from "./b2-object";

const META_PREFIX = "x-amz-meta-";

export { B2Object } from "./b2-object";

/**
 * The slice of the R2 bucket API the app uses (get with a range, put, head, delete, multipart uploads),
 * served by Backblaze B2 over its S3-compatible API. Signing reuses the SigV4 client, so it runs on Workers and Node.
 */
type PutValue =
	| ArrayBuffer
	| ArrayBufferView
	| string
	| ReadableStream
	| Blob
	| null;

async function toBuffer(value: PutValue): Promise<ArrayBuffer> {
	if (value === null) {
		return await new ArrayBuffer(0);
	}
	if (typeof value === "string") {
		return (await new TextEncoder().encode(value).buffer) as ArrayBuffer;
	}
	if (value instanceof ArrayBuffer) {
		return await value;
	}
	if (ArrayBuffer.isView(value)) {
		return (await value.buffer.slice(
			value.byteOffset,
			value.byteOffset + value.byteLength
		)) as ArrayBuffer;
	}
	if (value instanceof Blob) {
		return await value.arrayBuffer();
	}
	return await new Response(value).arrayBuffer();
}

const encodePath = (key: string) =>
	`/${key
		.split("/")
		.map((part) =>
			encodeURIComponent(part).replaceAll(
				/[!'()*]/gu,
				// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
				(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join("/")}`;

interface PutOptions {
	httpMetadata?: B2HttpMetadata | Headers;
	customMetadata?: Record<string, string>;
}

const escapeXml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

function metadataHeaders(options?: PutOptions): Record<string, string> {
	const headers: Record<string, string> = {};
	const meta = options?.httpMetadata;
	const http: B2HttpMetadata =
		meta instanceof Headers
			? {
					cacheControl: meta.get("cache-control") ?? undefined,
					contentDisposition: meta.get("content-disposition") ?? undefined,
					contentType: meta.get("content-type") ?? undefined,
				}
			: (meta ?? {});
	if (http.contentType) {
		headers["Content-Type"] = http.contentType;
	}
	if (http.contentDisposition) {
		headers["Content-Disposition"] = http.contentDisposition;
	}
	if (http.cacheControl) {
		headers["Cache-Control"] = http.cacheControl;
	}
	for (const [name, value] of Object.entries(options?.customMetadata ?? {})) {
		headers[`${META_PREFIX}${name.toLowerCase()}`] = value;
	}
	return headers;
}

function unsupportedList(): Promise<never> {
	return Promise.reject(new Error("B2Bucket.list is not implemented"));
}

export class B2Bucket {
	private readonly config: B2Config;
	private readonly credentials: AwsConfig;
	private readonly host: string;

	constructor(config: B2Config) {
		this.config = config;
		this.credentials = {
			accessKeyId: config.keyId,
			region: config.region,
			secretAccessKey: config.applicationKey,
		};
		this.host = `${config.bucket}.${config.endpoint}`;
	}

	private request(
		key: string | null,
		init: {
			method?: string;
			query?: Record<string, string>;
			body?: string | ArrayBuffer;
			headers?: Record<string, string>;
		} = {}
	) {
		return awsRequest({
			config: this.credentials,
			host: this.host,
			path: key === null ? "/" : encodePath(key),
			service: "s3",
			...init,
		});
	}

	async get(
		key: string,
		options?: { range?: { offset?: number; length?: number; suffix?: number } }
	): Promise<B2Object | null> {
		const range = options?.range;
		const headers: Record<string, string> = {};
		if (range) {
			if (range.suffix === null || range.suffix === undefined) {
				const start = range.offset ?? 0;
				headers.Range =
					range.length === null || range.length === undefined
						? `bytes=${start}-`
						: `bytes=${start}-${start + range.length - 1}`;
			} else {
				headers.Range = `bytes=-${range.suffix}`;
			}
		}
		try {
			return new B2Object(key, await this.request(key, { headers }));
		} catch (error) {
			if (
				error instanceof AwsError &&
				(error.status === 404 || error.code === "NoSuchKey")
			) {
				return null;
			}
			throw error;
		}
	}

	async head(key: string): Promise<B2Object | null> {
		try {
			return new B2Object(key, await this.request(key, { method: "HEAD" }));
		} catch (error) {
			if (error instanceof AwsError && error.status === 404) {
				return null;
			}
			throw error;
		}
	}

	async put(
		key: string,
		value: PutValue,
		options?: PutOptions
	): Promise<B2Object> {
		const body = await toBuffer(value);
		const response = await this.request(key, {
			body,
			headers: metadataHeaders(options),
			method: "PUT",
		});
		return new B2Object(
			key,
			new Response(null, { headers: response.headers }),
			body.byteLength
		);
	}

	async delete(keys: string | string[]): Promise<void> {
		const list = Array.isArray(keys) ? keys : [keys];
		for (let index = 0; index < list.length; index += 10) {
			await Promise.all(
				list.slice(index, index + 10).map(async (key) => {
					try {
						await this.request(key, { method: "DELETE" });
					} catch (error) {
						if (!(error instanceof AwsError && error.status === 404)) {
							throw error;
						}
					}
				})
			);
		}
	}

	list = unsupportedList;

	async createMultipartUpload(
		key: string,
		options?: {
			httpMetadata?: B2HttpMetadata;
			customMetadata?: Record<string, string>;
		}
	) {
		const response = await this.request(key, {
			headers: metadataHeaders(options),
			method: "POST",
			query: { uploads: "" },
		});
		const uploadId = xmlTag(await response.text(), "UploadId");
		if (!uploadId) {
			throw new Error("Backblaze did not return an upload id");
		}
		return this.resumeMultipartUpload(key, uploadId);
	}

	resumeMultipartUpload(key: string, uploadId: string) {
		return {
			abort: async () => {
				await this.request(key, { method: "DELETE", query: { uploadId } });
			},
			complete: async (parts: { partNumber: number; etag: string }[]) => {
				const body = `<CompleteMultipartUpload>${[...parts]
					.toSorted((a, b) => a.partNumber - b.partNumber)
					.map(
						(part) =>
							`<Part><PartNumber>${part.partNumber}</PartNumber><ETag>"${escapeXml(part.etag)}"</ETag></Part>`
					)
					.join("")}</CompleteMultipartUpload>`;
				const response = await this.request(key, {
					body,
					headers: { "Content-Type": "application/xml" },
					method: "POST",
					query: { uploadId },
				});
				// A 200 can still carry an <Error> document.
				const text = await response.text();
				if (/<Error>/u.test(text)) {
					throw new Error(xmlTag(text, "Message") ?? "Multipart upload failed");
				}
				const head = await this.head(key);
				if (!head) {
					throw new Error("Uploaded object not found");
				}
				return head;
			},
			key,
			uploadId,
			uploadPart: async (partNumber: number, value: PutValue) => {
				if (!Number.isInteger(partNumber) || partNumber < 1) {
					throw new Error("Invalid part number");
				}
				const response = await this.request(key, {
					body: await toBuffer(value),
					method: "PUT",
					query: { partNumber: String(partNumber), uploadId },
				});
				return {
					etag: (response.headers.get("etag") ?? "").replaceAll('"', ""),
					partNumber,
				};
			},
		};
	}
}

export function openB2Bucket(config: B2Config): R2Bucket {
	return new B2Bucket(config) as unknown as R2Bucket;
}
