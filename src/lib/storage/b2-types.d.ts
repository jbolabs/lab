/** Connection to an S3-compatible bucket: Backblaze B2 or AWS S3. The fields keep their B2 names. */
export interface B2Config {
	keyId: string;
	applicationKey: string;
	bucket: string;
	/** S3-compatible endpoint host without scheme, e.g. s3.us-west-004.backblazeb2.com. */
	endpoint: string;
	/** Signing region, the second label of the endpoint (us-west-004). */
	region: string;
}

export interface StorageStatus {
	provider: "backblaze" | "s3" | "r2" | "files";
	configured: boolean;
	bucket: string | null;
	endpoint: string | null;
}

export interface B2HttpMetadata {
	contentType?: string;
	contentDisposition?: string;
	cacheControl?: string;
}
