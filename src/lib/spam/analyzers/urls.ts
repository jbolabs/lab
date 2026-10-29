import type { ParsedEmail } from "@/lib/email/parse";

import type { PreparedSpamContent, SpamSignal } from "../types";

export function analyzeUrls(
	message: ParsedEmail,
	prepared: PreparedSpamContent
): SpamSignal[] {
	const domains = prepared.urlDomains;
	const signals: SpamSignal[] = [];
	if (domains.some((domain) => /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(domain))) {
		signals.push({
			id: "ip_address_url",
			reason: "A link uses an IP address instead of a domain",
			score: 8,
		});
	}
	if (domains.some((domain) => domain.includes("xn--"))) {
		signals.push({
			id: "punycode_url",
			reason: "A link uses an internationalized domain encoding",
			score: 5,
		});
	}
	if (domains.length > 10) {
		signals.push({
			id: "many_link_domains",
			metadata: { count: domains.length },
			reason: "Message links to an unusually large number of domains",
			score: Math.min(8, domains.length - 8),
		});
	}
	for (const match of (message.html ?? "")
		.slice(0, 250_000)
		.matchAll(
			/<a\b[^>]*\bhref=["'](?<capture1>https?:\/\/[^"']+)["'][^>]*>\s*(?<capture2>https?:\/\/[^<\s]+)\s*<\/a>/giu
		)) {
		try {
			const target = new URL(match[1]).hostname
				.toLowerCase()
				.replace(/^www\./u, "");
			const displayed = new URL(match[2]).hostname
				.toLowerCase()
				.replace(/^www\./u, "");
			if (target !== displayed) {
				signals.push({
					id: "displayed_link_mismatch",
					reason: "A link's displayed address differs from its destination",
					score: 10,
				});
				break;
			}
		} catch {
			// Malformed optional input is ignored.
		}
	}
	return signals;
}
