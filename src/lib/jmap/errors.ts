import type { JmapMethodError } from "./types";

export class JmapError extends Error {
	override name = "JmapError";
	public readonly type: string;
	public readonly extra: Record<string, unknown>;
	constructor(
		type: string,
		description?: string,
		extra: Record<string, unknown> = {}
	) {
		super(description ?? type);
		this.type = type;
		this.extra = extra;
	}

	toMethodError(): JmapMethodError {
		return {
			type: this.type,
			...(this.message === this.type ? {} : { description: this.message }),
			...this.extra,
		};
	}
}

export function invalidArguments(description: string): JmapError {
	return new JmapError("invalidArguments", description);
}

/** RFC 8620 §5.5: a filter the server cannot apply is an error, never a silent match-all. */
export function unsupportedFilter(description: string): JmapError {
	return new JmapError("unsupportedFilter", description);
}

export function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Max-Age": "86400",
	};
}

/** RFC 7807 problem document for request-level failures. */
export function problemResponse(
	type: string,
	status: number,
	detail: string,
	extra: Record<string, unknown> = {}
): Response {
	return Response.json(
		{
			detail,
			status,
			type: `urn:ietf:params:jmap:error:${type}`,
			...extra,
		},
		{
			headers: { "Content-Type": "application/problem+json", ...corsHeaders() },
			status,
		}
	);
}
