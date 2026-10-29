import type { CfApiError } from "@/lib/cloudflare-api.types";

export class CloudflareApiError extends Error {
	readonly status: number;
	readonly path: string;
	readonly errors: CfApiError[];
	constructor(
		message: string,
		status: number,
		path: string,
		errors: CfApiError[]
	) {
		super(message);
		this.status = status;
		this.path = path;
		this.errors = errors;
		this.name = "CloudflareApiError";
	}
}

export function isCloudflareApiErrorCode(
	error: unknown,
	code: number
): boolean {
	return (
		error instanceof CloudflareApiError &&
		error.errors.some((item) => item.code === code)
	);
}
