import type {
	ResendDomain,
	ResendReceivedEmail,
	ResendWebhook,
} from "@/lib/email/resend-api-types";

const RESEND_API = "https://api.resend.com";

export class ResendRestrictedKeyError extends Error {
	override name = "ResendRestrictedKeyError";

	constructor() {
		super(
			"This Resend key can only send mail, so the Lab cannot add or check domains. Add the domain in the Resend dashboard, or use a full-access key."
		);
	}
}

async function resendRequest<T>(
	apiKey: string,
	path: string,
	init?: RequestInit
): Promise<T> {
	const response = await fetch(`${RESEND_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
	const body = (await response.json().catch(() => null)) as {
		message?: string;
		name?: string;
	} | null;
	if (!response.ok) {
		// A send-only key cannot manage domains; say so instead of a bare 401.
		if (body?.name === "restricted_api_key") {
			throw new ResendRestrictedKeyError();
		}
		throw new Error(
			`Resend: ${body?.message ?? `request failed (${response.status})`}`
		);
	}
	return body as T;
}

export function getResendDomain(
	apiKey: string,
	id: string
): Promise<ResendDomain> {
	return resendRequest<ResendDomain>(
		apiKey,
		`/domains/${encodeURIComponent(id)}`
	);
}

export async function findResendDomain(
	apiKey: string,
	hostname: string
): Promise<ResendDomain | null> {
	const list = await resendRequest<{ data: ResendDomain[] }>(
		apiKey,
		"/domains"
	);
	const match = list.data.find(
		(domain) => domain.name.toLowerCase() === hostname.toLowerCase()
	);
	return match ? getResendDomain(apiKey, match.id) : null;
}

export interface ResendCapabilities {
	sending: boolean;
	receiving: boolean;
}

const toCapabilities = (capabilities: ResendCapabilities) => ({
	receiving: capabilities.receiving ? "enabled" : "disabled",
	sending: capabilities.sending ? "enabled" : "disabled",
});

export function createResendDomain(
	apiKey: string,
	hostname: string,
	capabilities?: ResendCapabilities
): Promise<ResendDomain> {
	return resendRequest<ResendDomain>(apiKey, "/domains", {
		body: JSON.stringify({
			capabilities: toCapabilities(
				capabilities ?? { receiving: false, sending: true }
			),
			name: hostname,
		}),
		method: "POST",
	});
}

/** Turns a capability on without touching the other (omitted fields keep their value). */
export async function updateResendCapabilities(
	apiKey: string,
	id: string,
	capabilities: Partial<ResendCapabilities>
): Promise<void> {
	const body: Record<string, string> = {};
	if (capabilities.sending !== undefined) {
		body.sending = capabilities.sending ? "enabled" : "disabled";
	}
	if (capabilities.receiving !== undefined) {
		body.receiving = capabilities.receiving ? "enabled" : "disabled";
	}
	await resendRequest<unknown>(apiKey, `/domains/${encodeURIComponent(id)}`, {
		body: JSON.stringify({ capabilities: body }),
		method: "PATCH",
	});
}

export async function listResendWebhooks(
	apiKey: string
): Promise<ResendWebhook[]> {
	return await resendRequest<{ data: ResendWebhook[] }>(
		apiKey,
		"/webhooks"
	).then((resolved) => resolved.data);
}

export function createResendWebhook(
	apiKey: string,
	endpoint: string
): Promise<{ id: string; signing_secret: string }> {
	return resendRequest(apiKey, "/webhooks", {
		body: JSON.stringify({ endpoint, events: ["email.received"] }),
		method: "POST",
	});
}

export async function deleteResendWebhook(
	apiKey: string,
	id: string
): Promise<void> {
	await resendRequest<unknown>(apiKey, `/webhooks/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export function getReceivedEmail(
	apiKey: string,
	id: string
): Promise<ResendReceivedEmail> {
	return resendRequest<ResendReceivedEmail>(
		apiKey,
		`/emails/receiving/${encodeURIComponent(id)}`
	);
}

export async function verifyResendDomain(
	apiKey: string,
	id: string
): Promise<void> {
	await resendRequest<unknown>(
		apiKey,
		`/domains/${encodeURIComponent(id)}/verify`,
		{ method: "POST" }
	);
}

/**
 * A key is valid if Resend accepts it at all. Send-only keys are rejected by the
 * domains endpoint with `restricted_api_key`, which still means the key works.
 */
export async function checkResendKey(
	apiKey: string
): Promise<{ valid: boolean; canManageDomains: boolean }> {
	const response = await fetch(`${RESEND_API}/domains`, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (response.ok) {
		return { canManageDomains: true, valid: true };
	}
	const body = (await response.json().catch(() => null)) as {
		name?: string;
	} | null;
	if (response.status === 401 && body?.name === "restricted_api_key") {
		return { canManageDomains: false, valid: true };
	}
	return { canManageDomains: false, valid: false };
}

export async function deleteResendDomain(
	apiKey: string,
	id: string
): Promise<void> {
	await resendRequest<unknown>(apiKey, `/domains/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}
