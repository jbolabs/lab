import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings, domains } from "@/db/schema";
import { requireAwsConfig } from "@/lib/aws/config";
import { sendSesEmail } from "@/lib/aws/ses";
import { getEmailAddress } from "@/lib/email/address";
import type {
	OutboundProviderConfig,
	OutboundProviderMessage,
	ResendKeyStatus,
} from "@/lib/email/outbound-provider-types";

/**
 * Each domain picks its own sender: Cloudflare Email Sending, Resend, or none
 * (receive-only). Receiving and storage always stay on Cloudflare. The Resend key
 * is shared by every domain; it comes from the admin setting, falling back to a
 * RESEND_API_KEY secret so it can be provisioned outside the database.
 */
export async function getResendKeyStatus(
	env: CloudflareEnv
): Promise<ResendKeyStatus & { apiKey: string | null }> {
	const [settings] = await getDb(env)
		.select({ resendApiKey: appSettings.resendApiKey })
		.from(appSettings)
		.where(eq(appSettings.id, "default"))
		.limit(1);
	const saved = settings?.resendApiKey?.trim();
	const fromEnv = (env as { RESEND_API_KEY?: string }).RESEND_API_KEY?.trim();
	return {
		apiKey: saved || fromEnv || null,
		configured: !!(saved || fromEnv),
		source: (() => {
			if (saved) {
				return "settings";
			}
			if (fromEnv) {
				return "environment";
			}
			return null;
		})(),
	};
}

export async function getResendApiKey(env: CloudflareEnv): Promise<string> {
	const { apiKey } = await getResendKeyStatus(env);
	if (!apiKey) {
		throw new Error("Resend is selected but no API key is configured");
	}
	return apiKey;
}

/** The provider for the domain a message is sent from. */
export async function getOutboundProviderConfig(
	env: CloudflareEnv,
	fromAddress: string
): Promise<OutboundProviderConfig> {
	const hostname = getEmailAddress(fromAddress).split("@")[1]?.toLowerCase();
	const [domain] = hostname
		? await getDb(env)
				.select({ provider: domains.sendingProvider })
				.from(domains)
				.where(eq(domains.hostname, hostname))
				.limit(1)
		: [];
	if (!domain || domain.provider === "none") {
		throw new Error(
			`Sending is not set up for ${hostname ?? "this domain"}. Choose a sending provider on the Domains page.`
		);
	}
	if (domain.provider === "resend") {
		return { apiKey: await getResendApiKey(env), provider: "resend" };
	}
	if (domain.provider === "ses") {
		return { config: await requireAwsConfig(env), provider: "ses" };
	}
	return { provider: "cloudflare" };
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x80_00) {
		// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x80_00));
	}
	return btoa(binary);
}

/** Resend does not return the RFC 5322 Message-ID, so we mint one for replies to thread against. */
function mintMessageId(from: string): string {
	const domain = getEmailAddress(from).split("@")[1] || "mailflare.local";
	return `<${crypto.randomUUID()}@${domain}>`;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function sendWithResend(
	apiKey: string,
	message: OutboundProviderMessage,
	idempotencyKey?: string
): Promise<{ messageId: string }> {
	const messageId =
		message.headers?.["Message-ID"] ?? mintMessageId(message.from);
	const response = await fetch(RESEND_ENDPOINT, {
		body: JSON.stringify({
			attachments: message.attachments?.map((attachment) => ({
				content: toBase64(attachment.content),
				content_type: attachment.type,
				filename: attachment.filename,
				...(attachment.disposition === "inline" && attachment.contentId
					? { content_id: attachment.contentId }
					: {}),
			})),

			from: message.from,

			...(message.cc?.length ? { cc: message.cc } : {}),

			...(message.bcc?.length ? { bcc: message.bcc } : {}),

			headers: { ...message.headers, "Message-ID": messageId },

			html: message.html,

			subject: message.subject,

			text: message.text,

			to: message.to,
		}),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		},
		method: "POST",
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			message?: string;
		} | null;
		throw new Error(
			`Resend: ${body?.message ?? `request failed (${response.status})`}`
		);
	}
	return { messageId };
}

export async function sendThroughProvider(
	env: CloudflareEnv,
	config: OutboundProviderConfig,
	message: OutboundProviderMessage,
	idempotencyKey?: string
): Promise<{ messageId: string }> {
	if (config.provider === "resend") {
		return sendWithResend(config.apiKey, message, idempotencyKey);
	}
	if (config.provider === "ses") {
		return sendSesEmail(config.config, message);
	}
	const response = await env.EMAIL.send({
		attachments: message.attachments?.map((attachment) =>
			attachment.disposition === "inline" && attachment.contentId
				? {
						content: attachment.content,
						contentId: attachment.contentId,
						disposition: "inline" as const,
						filename: attachment.filename,
						type: attachment.type,
					}
				: {
						content: attachment.content,
						disposition: "attachment" as const,
						filename: attachment.filename,
						type: attachment.type,
					}
		),

		from: message.from,

		...(message.cc?.length ? { cc: message.cc } : {}),

		...(message.bcc?.length ? { bcc: message.bcc } : {}),

		headers:
			message.headers && Object.keys(message.headers).length
				? message.headers
				: undefined,

		html: message.html,

		subject: message.subject,

		text: message.text,

		to: message.to,
	});
	return { messageId: response.messageId };
}
