/**
 * Push through a Mailflare push relay (the `mailflare-relay` Worker) instead of
 * holding an APNs key. The app trades its APNs token for an opaque handle at
 * the relay and registers the handle here in place of the token; sending is
 * then one POST to the relay, which signs and forwards it to Apple.
 */

/** Handles the relay issues start with this; APNs tokens are plain hex. */
export const RELAY_HANDLE_PREFIX = "mfr1.";

export function isRelayHandle(token: string): boolean {
	return token.startsWith(RELAY_HANDLE_PREFIX);
}

/** The relay this server pushes through (`APNS_RELAY_URL`), as an origin without a trailing slash; null when unset or not https. */
export function relayBaseUrl(env: { APNS_RELAY_URL?: string }): string | null {
	const raw = env.APNS_RELAY_URL?.trim();
	if (!raw) {
		return null;
	}
	try {
		const url = new URL(raw);
		if (
			url.protocol !== "https:" &&
			!(
				url.protocol === "http:" &&
				["localhost", "127.0.0.1"].includes(url.hostname)
			)
		) {
			return null;
		}
		return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
	} catch {
		return null;
	}
}

export type RelayResult =
	| { kind: "sent" }
	/** The relay no longer knows the device (404/410): forget the registration. */
	| { kind: "gone"; status: number }
	/** Worth trying again later (429, 5xx, network). */
	| { kind: "retry"; status: number }
	| { kind: "failed"; status: number; error: string };

export async function sendViaRelay(
	baseUrl: string,
	handle: string,
	payload: unknown,
	collapseId: string | undefined,
	fetchImpl: typeof fetch = fetch
): Promise<RelayResult> {
	let response: Response;
	try {
		response = await fetchImpl(`${baseUrl}/api/v1/push`, {
			body: JSON.stringify({
				handle,
				payload,
				...(collapseId ? { collapseId } : {}),
			}),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
	} catch {
		return { kind: "retry", status: 0 };
	}
	if (response.ok) {
		return { kind: "sent" };
	}
	if (response.status === 404 || response.status === 410) {
		return { kind: "gone", status: response.status };
	}
	if (response.status === 429 || response.status >= 500) {
		return { kind: "retry", status: response.status };
	}
	const error =
		((await response.json().catch(() => ({}))) as { error?: string }).error ??
		"";
	return { error, kind: "failed", status: response.status };
}
