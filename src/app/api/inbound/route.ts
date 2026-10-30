import { getEnv } from "@/lib/cloudflare";
import { inboundAttachmentLimitReasonFromRaw } from "@/lib/email/inbound-attachments";
import { intakeIncomingMail } from "@/lib/email/intake";
import { verifyInboundSignature } from "@/lib/email/intake-signature";

/**
 * Inbound mail from the Cloudflare email relay Worker (deploy/cloudflare-email-relay).
 * The body is the raw RFC 5322 message; envelope addresses travel in headers and
 * the request is HMAC-signed with INBOUND_WEBHOOK_SECRET. The response tells the
 * relay whether to reject or forward, since only it can act on the live message.
 */
export async function POST(request: Request) {
	const env = getEnv();
	const secret = env.INBOUND_WEBHOOK_SECRET?.trim();
	if (!secret) {
		return Response.json(
			{ error: "INBOUND_WEBHOOK_SECRET is not configured" },
			{ status: 503 }
		);
	}

	const raw = await request.arrayBuffer();
	if (raw.byteLength > 25 * 1024 * 1024) {
		return Response.json(
			{ error: "Message exceeds the 25 MiB receiving limit" },
			{ status: 413 }
		);
	}
	const from = request.headers.get("x-mailflare-from") ?? "";
	const to = request.headers.get("x-mailflare-to") ?? "";
	const signature = request.headers.get("x-mailflare-signature") ?? "";
	if (
		!from ||
		!to ||
		!(await verifyInboundSignature(secret, signature, raw, from, to))
	) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}
	const attachmentLimitReason = await inboundAttachmentLimitReasonFromRaw(raw);
	if (attachmentLimitReason) {
		return Response.json({
			action: "reject",
			reason: attachmentLimitReason,
		});
	}

	let headers: Record<string, string> = {};
	try {
		headers = JSON.parse(
			request.headers.get("x-mailflare-headers") ?? "{}"
		) as Record<string, string>;
	} catch {
		// The header map is advisory; the raw message is authoritative.
	}

	let forwardTo: string | null = null;
	let forwardHeaders: Record<string, string> = {};
	const result = await intakeIncomingMail(
		env,
		{ from, headers, raw, to },
		{
			// The relay performs the forward on the live message; report it as done so keep-copy applies.
			forward: (destination, extra) => {
				forwardTo = destination;
				forwardHeaders = extra;
				return Promise.resolve(true);
			},
		}
	);
	return Response.json({ ...result, forwardHeaders, forwardTo });
}
