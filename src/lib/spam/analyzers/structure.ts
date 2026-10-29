import type { ParsedEmail } from "@/lib/email/parse";

import { getDomain } from "../tokenizer";
import type { PreparedSpamContent, SpamSignal } from "../types";
import { findHeader } from "./utils";

export function analyzeStructure(
	message: ParsedEmail,
	headers: Record<string, string> | undefined,
	prepared: PreparedSpamContent
): SpamSignal[] {
	const signals: SpamSignal[] = [];
	const visible = prepared.visibleText;
	const fromDomain = getDomain(message.fromAddr);
	const replyDomain = getDomain(findHeader(headers, "reply-to"));
	const upperLetters = (visible.match(/[A-Z]/gu) ?? []).length;
	const letters = (visible.match(/[A-Za-z]/gu) ?? []).length;
	if (!message.subject?.trim()) {
		signals.push({
			id: "empty_subject",
			reason: "Message has no subject",
			score: 3,
		});
	}
	if (message.html && !message.text?.trim() && visible.trim().length < 80) {
		signals.push({
			id: "thin_html_only",
			reason: "HTML-only message has very little visible text",
			score: 6,
		});
	}
	if (/[\u200B-\u200D\u2060\uFEFF]/u.test(visible)) {
		signals.push({
			id: "zero_width_text",
			reason: "Message contains hidden zero-width characters",
			score: 7,
		});
	}
	if (letters > 40 && upperLetters / letters > 0.65) {
		signals.push({
			id: "excessive_capitals",
			reason: "Message uses excessive capitalization",
			score: 4,
		});
	}
	if (replyDomain && fromDomain && replyDomain !== fromDomain) {
		signals.push({
			id: "reply_to_mismatch",
			reason: "Reply-To domain differs from the sender domain",
			score: 5,
		});
	}
	function analyzeLures() {
		const credentialLure =
			/\b(?<capture1>verify|confirm|unlock|restore|validate|sign[ -]?in|log[ -]?in)\b.{0,60}\b(?<capture2>account|password|mailbox|identity|access)\b/iu.test(
				visible
			) ||
			/\b(?<capture1>account|password|mailbox|identity|access)\b.{0,60}\b(?<capture2>verify|confirm|unlock|restore|validate|sign[ -]?in|log[ -]?in)\b/iu.test(
				visible
			);
		const urgent =
			/\b(?<capture1>urgent|immediately|within 24 hours|suspended|expires? today|final warning)\b/iu.test(
				visible
			);
		if (credentialLure && urgent && prepared.urlDomains.length > 0) {
			signals.push({
				id: "credential_phishing_pattern",
				reason:
					"Message combines an urgent account request with an external link",
				score: 24,
			});
		}
		const paymentLure =
			/\b(?<capture1>gift card|wire transfer|cryptocurrency|bitcoin|wallet|bank transfer)\b/iu.test(
				visible
			);
		const paymentRequest =
			/\b(?<capture1>pay|payment|send|transfer|purchase|deposit)\b/iu.test(
				visible
			);
		if (
			paymentLure &&
			paymentRequest &&
			(urgent || (!!replyDomain && !!fromDomain && replyDomain !== fromDomain))
		) {
			signals.push({
				id: "payment_scam_pattern",
				reason: "Message contains a high-risk urgent payment pattern",
				score: 16,
			});
		}
	}
	analyzeLures();
	const risky = message.attachments.filter((attachment) =>
		/\.(?<capture1>exe|scr|js|vbs|bat|cmd|iso|img)$/iu.test(attachment.filename)
	);
	if (risky.length) {
		signals.push({
			id: "risky_attachment",
			metadata: { count: risky.length },
			reason: "Message contains a potentially risky attachment",
			score: 10,
		});
	}
	return signals;
}
