import { getEmailAddress } from "@/lib/email/address";
import type { ParsedEmail } from "@/lib/email/parse";
import { htmlToReadableText } from "@/lib/email/reply-content-utils";

import type { PreparedSpamContent } from "./types";
import { MAX_CANDIDATE_TOKENS } from "./weights";

export function getDomain(value: string | null | undefined): string {
	const address = getEmailAddress(value ?? "").toLowerCase();
	return address.includes("@")
		? address.slice(address.lastIndexOf("@") + 1)
		: "";
}

const URL_RE = /https?:\/\/[^\s<>"']+/giu;

export function extractUrlDomains(message: ParsedEmail): string[] {
	const source = `${message.text ?? ""}\n${message.html ?? ""}`.slice(
		0,
		250_000
	);
	const result = new Set<string>();
	for (const match of source.matchAll(URL_RE)) {
		try {
			const domain = new URL(match[0]).hostname
				.toLowerCase()
				.replace(/^www\./u, "");
			if (domain) {
				result.add(domain);
			}
		} catch {
			// Malformed optional input is ignored.
		}
		if (result.size >= 50) {
			break;
		}
	}
	return [...result];
}

export function prepareSpamContent(message: ParsedEmail): PreparedSpamContent {
	return {
		urlDomains: extractUrlDomains(message),
		visibleText:
			`${message.subject ?? ""}\n${message.text ?? ""}\n${htmlToReadableText(message.html)}`.slice(
				0,
				250_000
			),
	};
}

export function tokenizeMessage(
	message: ParsedEmail,
	prepared = prepareSpamContent(message)
): string[] {
	const sender = getEmailAddress(message.fromAddr ?? "").toLowerCase();
	const senderDomain = getDomain(sender);
	const tokens = new Set<string>();
	for (const raw of prepared.visibleText
		.toLowerCase()
		.match(/[\p{L}\p{N}][\p{L}\p{N}_$%.-]{1,48}/gu) ?? []) {
		const token = raw.replaceAll(/^[._-]+|[._-]+$/gu, "");
		if (token.length >= 2 && token.length <= 50) {
			tokens.add(token);
		}
		if (tokens.size >= MAX_CANDIDATE_TOKENS) {
			break;
		}
	}
	if (message.subject) {
		for (const raw of message.subject
			.toLowerCase()
			.match(/[\p{L}\p{N}]{2,40}/gu) ?? []) {
			tokens.add(`SUBJECT:${raw}`);
		}
	}
	if (sender) {
		tokens.add(`FROM:${sender}`);
	}
	if (senderDomain) {
		tokens.add(`FROM_DOMAIN:${senderDomain}`);
	}
	for (const domain of prepared.urlDomains) {
		tokens.add(`URL_DOMAIN:${domain}`);
	}
	if (message.html && !message.text?.trim()) {
		tokens.add("HTML_ONLY");
	}
	if (message.attachments.length) {
		tokens.add("HAS_ATTACHMENT");
	}
	return [...tokens].slice(0, MAX_CANDIDATE_TOKENS);
}

export function buildFingerprint(
	message: ParsedEmail,
	prepared = prepareSpamContent(message)
): string {
	const normalized = [
		(message.subject ?? "")
			.toLowerCase()
			.replaceAll(/\s+/gu, " ")
			.trim()
			.slice(0, 160),
		getDomain(message.fromAddr),
		[...prepared.urlDomains].toSorted().join(","),
		prepared.visibleText
			.toLowerCase()
			.replaceAll(/\d+/gu, "#")
			.replaceAll(/\s+/gu, " ")
			.trim()
			.slice(0, 500),
	].join("|");
	let hash = 2_166_136_261;
	for (let index = 0; index < normalized.length; index += 1) {
		// oxlint-disable-next-line eslint/no-bitwise, unicorn/prefer-code-point -- Persisted FNV-1a token hashes require 32-bit XOR and unsigned normalization. Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		hash ^= normalized.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	// oxlint-disable-next-line eslint/no-bitwise -- Persisted FNV-1a token hashes require 32-bit XOR and unsigned normalization.
	return (hash >>> 0).toString(16).padStart(8, "0");
}
