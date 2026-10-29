import { authFetch } from "@/lib/auth/client";
import { defaultTranslator } from "@/lib/i18n/utils";

/** A rejected response, keeping the parsed body so callers can read fields beyond `error`. */
export class ApiError extends Error {
	readonly data: unknown;
	constructor(message: string, data: unknown) {
		super(message);
		this.data = data;
		this.name = "ApiError";
	}
}

export async function requestJson<T>(
	url: string,
	method: string,
	body?: unknown
): Promise<T> {
	const response = await authFetch(url, {
		body: body === undefined ? undefined : JSON.stringify(body),
		cache: "no-store",
		headers: { "Content-Type": "application/json" },
		method,
	});
	const data = (await response.json()) as T & { error?: string };
	if (!response.ok) {
		throw new ApiError(
			data.error ?? defaultTranslator("domains.requestFailed"),
			data
		);
	}
	return data;
}

export const postJson = <T>(url: string, method: string, body: unknown) =>
	requestJson<T>(url, method, body);

interface SetupResponse {
	error?: string;
	code?: string;
	records?: { content: string; priority: number }[];
}

/** Whether a response is a 409 MX_CONFLICT the user agreed to resolve by replacing the listed MX records. */
export async function confirmMxReplacement(
	response: Response,
	data: SetupResponse,
	confirm: (message: string) => Promise<boolean>
): Promise<boolean> {
	if (response.status !== 409 || data.code !== "MX_CONFLICT") {
		return false;
	}
	const list = (data.records ?? [])
		.map((record) => `  ${record.priority} ${record.content}`)
		.join("\n");
	return await confirm(
		`${data.error}\n\n${list}\n\nReplace them? Mail will stop going to the current service.`
	);
}

/**
 * Runs a receiving provider's setup. Other MX records would shadow the new one,
 * so the server refuses (409) until the user agrees to replace them.
 * Returns false when the user declined.
 */
export async function runReceivingSetup(
	domainId: string,
	provider: "cloudflare" | "resend" | "ses",
	confirm: (message: string) => Promise<boolean>
): Promise<boolean> {
	const call = async (replaceMx: boolean) => {
		const response = await authFetch(
			`/api/domains/${domainId}/receiving/${provider}`,
			{
				body: JSON.stringify({ replaceMx }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);
		return { data: (await response.json()) as SetupResponse, response };
	};
	let { response, data } = await call(false);
	if (response.status === 409 && data.code === "MX_CONFLICT") {
		if (!(await confirmMxReplacement(response, data, confirm))) {
			return false;
		}
		({ response, data } = await call(true));
	}
	if (!response.ok) {
		throw new Error(data.error ?? defaultTranslator("domains.setupFailed"));
	}
	return true;
}
