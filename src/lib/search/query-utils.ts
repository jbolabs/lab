import { dateFromZonedFields, normalizeTimeZone } from "@/lib/time/utils";

import type { ParsedSearchQuery, SearchToken } from "./types";

function parseDate(value: string, timeZone: string): Date | undefined {
	const match = value.match(
		/^(?<capture1>\d{4})[-/](?<capture2>\d{1,2})[-/](?<capture3>\d{1,2})$/u
	);
	if (!match) {
		return undefined;
	}
	const date = new Date(0);
	date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	if (
		date.getUTCFullYear() !== Number(match[1]) ||
		date.getUTCMonth() !== Number(match[2]) - 1 ||
		date.getUTCDate() !== Number(match[3])
	) {
		return undefined;
	}
	return dateFromZonedFields(date, normalizeTimeZone(timeZone));
}

/**
 * Gmail-style search grammar shared by the search box and the API:
 *
 *   from:maya to:"sam okoro" subject:invoice has:attachment is:unread
 *   is:starred after:2026-09-01 before:2026-09-30 "exact phrase" -excluded word
 *
 * The older `title:` and bare `:unread` / `:read` forms keep working.
 */
const OPERATOR_RE =
	/(?:^|\s)(?<capture1>from|to|subject|title|has|is|after|before|newer|older):(?:"(?<capture2>[^"]*)"|(?<capture3>\S+))/giu;

export function parseSearchQuery(
	raw: string,
	timeZone = "UTC"
): ParsedSearchQuery {
	const parsed: ParsedSearchQuery = { needsFullText: false, text: "" };
	let rest = raw ?? "";

	rest = rest.replaceAll(
		OPERATOR_RE,
		(
			_match,
			key: string,
			quoted: string | undefined,
			bare: string | undefined
		) => {
			const value = (quoted ?? bare ?? "").trim();
			switch (key.toLowerCase()) {
				case "from": {
					parsed.from = value;
					break;
				}
				case "to": {
					parsed.to = value;
					break;
				}
				case "subject":
				case "title": {
					parsed.subject = value;
					break;
				}
				case "has": {
					if (/^attachments?$/iu.test(value)) {
						parsed.hasAttachment = true;
					}
					break;
				}
				case "is": {
					if (/^unread$/iu.test(value)) {
						parsed.read = "unread";
					} else if (/^read$/iu.test(value)) {
						parsed.read = "read";
					} else if (/^starred$/iu.test(value)) {
						parsed.starred = true;
					}
					break;
				}
				case "after":
				case "newer": {
					parsed.after = parseDate(value, timeZone) ?? parsed.after;
					break;
				}
				case "before":
				case "older": {
					parsed.before = parseDate(value, timeZone) ?? parsed.before;
					break;
				}

				default: {
					break;
				}
			}
			return " ";
		}
	);

	if (/(?<capture1>^|\s):unread(?=\s|$)/iu.test(rest)) {
		parsed.read = "unread";
		rest = rest.replaceAll(/(?<capture1>^|\s):unread(?=\s|$)/giu, " ");
	} else if (/(?<capture1>^|\s):read(?=\s|$)/iu.test(rest)) {
		parsed.read = "read";
		rest = rest.replaceAll(/(?<capture1>^|\s):read(?=\s|$)/giu, " ");
	}

	parsed.text = rest.replaceAll(/\s+/gu, " ").trim();
	parsed.needsFullText = !!(
		parsed.text ||
		parsed.from ||
		parsed.to ||
		parsed.subject
	);
	return parsed;
}

/** Split free text into phrases ("..."), negations (-word) and plain terms. */
export function tokenizeSearchText(text: string): SearchToken[] {
	const tokens: SearchToken[] = [];
	const re =
		/(?<capture1>-?)"(?<capture2>[^"]+)"|(?<capture3>-?)(?<capture4>\S+)/gu;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text))) {
		if (match[2] === undefined) {
			const term = match[4].replace(/^-+/u, "").trim();
			if (term) {
				tokens.push({ negate: match[3] === "-", phrase: false, term });
			}
		} else {
			const term = match[2].trim();
			if (term) {
				tokens.push({ negate: match[1] === "-", phrase: true, term });
			}
		}
	}
	return tokens;
}

/** FTS5 string literal: double quotes doubled, so user input can never alter the query grammar. */
function ftsString(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

/**
 * One term. Phrases match whole words; plain terms match by prefix so "inv"
 * finds "invoice". Punctuation FTS5 treats as separators is normalised to
 * spaces first, so "maya@acme.test" becomes the phrase "maya acme test".
 */
function ftsTerm(term: string, phrase: boolean): string {
	const cleaned = term
		.replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
		.replaceAll(/\s+/gu, " ")
		.trim();
	if (!cleaned) {
		return "";
	}
	if (phrase || cleaned.includes(" ")) {
		// A multi-word prefix query needs the last word starred, which FTS5 only
		// allows inside a phrase as `"a b" *`; keep it simple and require whole words.
		return ftsString(cleaned);
	}
	return `${ftsString(cleaned)}*`;
}

/**
 * Build the FTS5 MATCH expression. Column filters restrict a term to one
 * column; free text is ANDed across the whole row. Returns null when there is
 * nothing to match, so callers skip the index entirely.
 */
export function buildFtsMatch(parsed: ParsedSearchQuery): string | null {
	const parts: string[] = [];

	for (const token of tokenizeSearchText(parsed.text)) {
		const expr = ftsTerm(token.term, token.phrase);
		if (!expr) {
			continue;
		}
		parts.push(token.negate ? `NOT ${expr}` : expr);
	}
	const column = (name: string, value: string | undefined) => {
		if (!value) {
			return;
		}
		const terms = tokenizeSearchText(value)
			.map((token) => ftsTerm(token.term, token.phrase))
			.filter(Boolean);
		if (terms.length === 0) {
			return;
		}
		parts.push(`${name} : (${terms.join(" AND ")})`);
	};
	column("subject", parsed.subject);
	column("from_addr", parsed.from);
	column("{to_addr cc_addr}", parsed.to);

	if (parts.length === 0) {
		return null;
	}
	// FTS5 has no unary NOT: "a NOT b" is binary. A leading negation is turned
	// into "match anything" minus the term.
	const positives = parts.filter((part) => !part.startsWith("NOT "));
	const negatives = parts
		.filter((part) => part.startsWith("NOT "))
		.map((part) => part.slice(4));
	const base =
		positives.length > 0 ? positives.join(" AND ") : `${ftsString("")}*`;
	return negatives.length > 0
		? `(${base}) NOT (${negatives.join(" OR ")})`
		: base;
}
