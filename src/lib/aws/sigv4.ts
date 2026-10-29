import type { AwsCredentials } from "@/lib/aws/aws-types";

function hex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");
}

const encoder = new TextEncoder();

export async function sha256Hex(
	data: string | ArrayBuffer | Uint8Array
): Promise<string> {
	const bytes = typeof data === "string" ? encoder.encode(data) : data;
	return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmac(
	key: ArrayBuffer | Uint8Array,
	data: string
): Promise<ArrayBuffer> {
	const imported = await crypto.subtle.importKey(
		"raw",
		key as BufferSource,
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	return crypto.subtle.sign("HMAC", imported, encoder.encode(data));
}

export interface SignInput {
	method: string;
	url: URL;
	headers: Record<string, string>;
	body: string | ArrayBuffer | Uint8Array;
	region: string;
	service: string;
	credentials: AwsCredentials;
	now?: Date;
}

const rfc3986 = (value: string) =>
	encodeURIComponent(value).replaceAll(
		/[!'()*]/gu,
		// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);

/**
 * AWS Signature Version 4. Returns the headers to send, including Authorization.
 * Web Crypto only, so it runs on Workers and in the Node build alike.
 */
export async function signAwsRequest(
	input: SignInput
): Promise<Record<string, string>> {
	const { method, url, region, service, credentials } = input;
	const amzDate = (input.now ?? new Date())
		.toISOString()
		.replaceAll(/[:-]|\.\d{3}/gu, "");
	const dateStamp = amzDate.slice(0, 8);
	const payloadHash = await sha256Hex(input.body);

	const headers: Record<string, string> = {
		...input.headers,
		host: url.host,
		"x-amz-date": amzDate,
	};
	if (service === "s3") {
		headers["x-amz-content-sha256"] = payloadHash;
	}
	if (credentials.sessionToken) {
		headers["x-amz-security-token"] = credentials.sessionToken;
	}

	const normalized = Object.entries(headers)
		.map(
			([name, value]) =>
				[name.toLowerCase(), value.trim().replaceAll(/\s+/gu, " ")] as const
		)
		.toSorted(([a], [b]) =>
			(() => {
				if (a < b) {
					return -1;
				}
				if (a > b) {
					return 1;
				}
				return 0;
			})()
		);
	const signedHeaders = normalized.map(([name]) => name).join(";");
	const canonicalHeaders = normalized
		.map(([name, value]) => `${name}:${value}\n`)
		.join("");

	// S3 signs the path as sent; every other service signs it percent-encoded twice.
	const canonicalPath =
		service === "s3"
			? url.pathname || "/"
			: (url.pathname || "/")
					.split("/")
					.map((segment) => rfc3986(decodeURIComponent(segment)))
					.join("/");
	const canonicalQuery = [...url.searchParams.entries()]
		.map(([name, value]) => [rfc3986(name), rfc3986(value)] as const)
		.toSorted(([a, av], [b, bv]) =>
			(() => {
				if (a < b) {
					return -1;
				}
				if (a > b) {
					return 1;
				}
				if (av < bv) {
					return -1;
				}
				if (av > bv) {
					return 1;
				}
				return 0;
			})()
		)
		.map(([name, value]) => `${name}=${value}`)
		.join("&");

	const canonicalRequest = [
		method,
		canonicalPath,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");
	const scope = `${dateStamp}/${region}/${service}/aws4_request`;
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		await sha256Hex(canonicalRequest),
	].join("\n");

	const kDate = await hmac(
		encoder.encode(`AWS4${credentials.secretAccessKey}`),
		dateStamp
	);
	const kRegion = await hmac(kDate, region);
	const kService = await hmac(kRegion, service);
	const kSigning = await hmac(kService, "aws4_request");
	const signature = hex(await hmac(kSigning, stringToSign));

	return {
		...headers,
		Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
	};
}
