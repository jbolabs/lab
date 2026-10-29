import type { AwsConfig } from "@/lib/aws/aws-types";
import { awsRequest, AwsError } from "@/lib/aws/client";
import { sha256Hex } from "@/lib/aws/sigv4";
import { requireValue } from "@/lib/require-value";

export async function listBuckets(config: AwsConfig): Promise<void> {
	await awsRequest({
		config,
		host: `s3.${config.region}.amazonaws.com`,
		service: "s3",
	});
}

const bucketHost = (config: AwsConfig, bucket: string) =>
	`${bucket}.s3.${config.region}.amazonaws.com`;

export async function bucketExists(
	config: AwsConfig,
	bucket: string
): Promise<boolean> {
	try {
		await awsRequest({
			config,
			host: bucketHost(config, bucket),
			method: "HEAD",
			service: "s3",
		});
		return true;
	} catch (error) {
		if (error instanceof AwsError && error.status === 404) {
			return false;
		}
		throw error;
	}
}

export async function createBucket(
	config: AwsConfig,
	bucket: string
): Promise<void> {
	const body =
		config.region === "us-east-1"
			? ""
			: `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${config.region}</LocationConstraint></CreateBucketConfiguration>`;
	try {
		await awsRequest({
			body,
			config,
			host: bucketHost(config, bucket),
			method: "PUT",
			service: "s3",
		});
	} catch (error) {
		if (
			!(error instanceof AwsError && error.code === "BucketAlreadyOwnedByYou")
		) {
			throw error;
		}
	}
}

export async function putBucketPolicy(
	config: AwsConfig,
	bucket: string,
	policy: unknown
): Promise<void> {
	await awsRequest({
		body: JSON.stringify(policy),
		config,
		headers: { "Content-Type": "application/json" },
		host: bucketHost(config, bucket),
		method: "PUT",
		query: { policy: "" },
		service: "s3",
	});
}

/** Expires leftover raw messages; best effort, since we delete each object after intake. */
export async function putExpiryLifecycle(
	config: AwsConfig,
	bucket: string,
	prefix: string,
	days: number
): Promise<void> {
	const body = `<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Rule><ID>mailflare-expire-inbound</ID><Filter><Prefix>${prefix}</Prefix></Filter><Status>Enabled</Status><Expiration><Days>${days}</Days></Expiration></Rule></LifecycleConfiguration>`;
	const digest = new Uint8Array(
		requireValue(
			await sha256Hex(body).then((resolved) => resolved.match(/../gu))
		).map((byte) => Number.parseInt(byte, 16))
	);
	await awsRequest({
		body,
		config,
		headers: {
			"Content-Type": "application/xml",
			// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
			"x-amz-checksum-sha256": btoa(String.fromCharCode(...digest)),
			"x-amz-sdk-checksum-algorithm": "SHA256",
		},
		host: bucketHost(config, bucket),
		method: "PUT",
		query: { lifecycle: "" },
		service: "s3",
	});
}

export async function getObject(
	config: AwsConfig,
	bucket: string,
	key: string
): Promise<ArrayBuffer> {
	const response = await awsRequest({
		config,
		host: bucketHost(config, bucket),
		path: `/${key.split("/").map(encodeURIComponent).join("/")}`,
		service: "s3",
	});
	return response.arrayBuffer();
}

export async function deleteObject(
	config: AwsConfig,
	bucket: string,
	key: string
): Promise<void> {
	await awsRequest({
		config,
		host: bucketHost(config, bucket),
		method: "DELETE",
		path: `/${key.split("/").map(encodeURIComponent).join("/")}`,
		service: "s3",
	});
}
