import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";

import { getEmailAddress } from "@/lib/email/address";

interface Builder {
	from: string | { name?: string; email: string };
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { name?: string; email: string };
	subject: string;
	headers?: Record<string, string>;
	text?: string;
	html?: string;
	attachments?: {
		filename: string;
		type: string;
		content: ArrayBuffer | ArrayBufferView | string;
		disposition?: string;
		contentId?: string;
	}[];
}

export type MailerConfig =
	| { kind: "smtp"; url: string }
	| { kind: "cloudflare"; accountId: string; token: string }
	| { kind: "none" };

function addressString(
	value: string | { name?: string; email: string }
): string {
	if (typeof value === "string") {
		return value;
	}
	return value.name
		? `"${value.name.replaceAll('"', '\\"')}" <${value.email}>`
		: value.email;
}

function messageIdFor(from: Builder["from"]): string {
	const domain =
		getEmailAddress(addressString(from)).split("@")[1] || "mailflare.local";
	return `<${crypto.randomUUID()}@${domain}>`;
}

/**
 * The `send_email` binding's builder API over SMTP (any provider, or your
 * own MTA) or Cloudflare's Email Sending REST endpoint. A Message-ID is
 * generated here and passed as a header so threading behaves the same as on
 * Workers, where Cloudflare returns the id it assigned.
 */
function base64(buffer: Buffer): string {
	return (
		buffer as unknown as { toString: (encoding: string) => string }
	).toString("base64");
}

function toBuffer(content: ArrayBuffer | ArrayBufferView | string): Buffer {
	if (typeof content === "string") {
		return Buffer.from(content);
	}
	if (content instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(content));
	}
	return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
}

export class Mailer {
	private transporter: Transporter | null = null;

	private readonly config: MailerConfig;
	constructor(config: MailerConfig) {
		this.config = config;
		if (config.kind === "smtp") {
			// Self-signed relays are common on private networks; opt in explicitly.
			const rejectUnauthorized =
				process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";
			this.transporter = createTransport({
				tls: { rejectUnauthorized },
				url: config.url,
			});
		}
	}

	get configured() {
		return this.config.kind !== "none";
	}

	async send(message: Builder): Promise<{ messageId: string }> {
		const messageId =
			message.headers?.["Message-ID"] ?? messageIdFor(message.from);
		const headers = { ...message.headers, "Message-ID": messageId };

		if (this.config.kind === "smtp" && this.transporter) {
			await this.transporter.sendMail({
				attachments: (message.attachments ?? []).map((attachment) => ({
					cid: attachment.contentId ?? undefined,
					content: toBuffer(attachment.content),
					contentDisposition:
						attachment.disposition === "inline" ? "inline" : "attachment",
					contentType: attachment.type,
					filename: attachment.filename,
				})),
				bcc: message.bcc,
				cc: message.cc,
				from: addressString(message.from),
				headers: Object.fromEntries(
					Object.entries(headers).filter(([key]) => key !== "Message-ID")
				),
				html: message.html,
				messageId,
				replyTo: message.replyTo ? addressString(message.replyTo) : undefined,
				subject: message.subject,
				text: message.text,
				to: message.to,
			});
			return { messageId };
		}

		if (this.config.kind === "cloudflare") {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/email/sending/send`,
				{
					body: JSON.stringify({
						attachments: (message.attachments ?? []).map((attachment) => ({
							content: base64(toBuffer(attachment.content)),
							disposition:
								attachment.disposition === "inline" ? "inline" : "attachment",
							filename: attachment.filename,
							type: attachment.type,
							...(attachment.contentId
								? { content_id: attachment.contentId }
								: {}),
						})),
						bcc: message.bcc,
						cc: message.cc,
						from: addressString(message.from),
						headers,
						html: message.html,
						reply_to: message.replyTo
							? addressString(message.replyTo)
							: undefined,
						subject: message.subject,
						text: message.text,
						to: message.to,
					}),
					headers: {
						Authorization: `Bearer ${this.config.token}`,
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			);
			if (!response.ok) {
				const detail = await response.text().catch(() => "");
				throw new Error(
					`Cloudflare Email Sending failed (${response.status}): ${detail.slice(0, 300)}`
				);
			}
			return { messageId };
		}

		throw new Error(
			"Outbound mail is not configured. Set SMTP_URL, or CF_ACCOUNT_ID and CF_TOKEN."
		);
	}

	/** Relay a raw RFC 5322 message unchanged, for forwarding rules. SMTP only. */
	async sendRaw(
		envelopeFrom: string,
		to: string,
		raw: Buffer
	): Promise<boolean> {
		if (!this.transporter) {
			return false;
		}
		await this.transporter.sendMail({
			envelope: { from: envelopeFrom, to },
			raw,
		});
		return true;
	}
}

export function openMailer(config: MailerConfig): SendEmail & Mailer {
	return new Mailer(config) as unknown as SendEmail & Mailer;
}
