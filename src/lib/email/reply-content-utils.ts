import { normalizeEmailAddress } from "./address";
import type {
	PreviousMessageDirection,
	ReplyContentParts,
	QuotedEmailContent,
	SplitReplyContentOptions,
} from "./reply-content-types";

function normalizeContent(content: string | null | undefined): string {
	return (content ?? "").replaceAll(/\r\n?/gu, "\n");
}

function trimEmptyLines(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;

	while (start < end && !lines[start]?.trim()) {
		start += 1;
	}
	while (end > start && !lines[end - 1]?.trim()) {
		end -= 1;
	}

	return lines.slice(start, end);
}

function hasQuotedContent(quotedContent: QuotedEmailContent): boolean {
	return (
		quotedContent.content.trim().length > 0 ||
		quotedContent.quotedContent.length > 0
	);
}

function stripSingleQuotePrefix(lines: string[]): string[] {
	return trimEmptyLines(lines.map((line) => line.replace(/^\s*>\s?/u, "")));
}

function getPreviousMessageDirection(
	from: string | undefined,
	ownAddress: string | undefined
): PreviousMessageDirection {
	if (!from || !ownAddress) {
		return "received";
	}
	const fromAddress = normalizeEmailAddress(
		from.match(/<(?<capture1>[^>]+)>/u)?.[1] ?? from
	);
	return fromAddress === normalizeEmailAddress(ownAddress)
		? "sent"
		: "received";
}

const HEADER_RE =
	/^(?<capture1>From|To|Cc|Subject|Date|Sent):\s*(?<capture2>.*)$/iu;

const ORIGINAL_MESSAGE_RE = /^-{2,}\s*Original Message\s*-{2,}$/iu;

const UNDERSCORE_SEPARATOR_RE = /^_{8,}$/u;

function getHeaderValue(lines: string[], name: string): string | undefined {
	for (const line of lines) {
		const match = line.match(HEADER_RE);
		if (match?.[1].toLowerCase() === name) {
			return match[2].trim();
		}
	}
	return undefined;
}

const WROTE_RE = /^On\s+(?<capture1>.+?)\s+wrote:\s*$/iu;

function getWroteDateLine(line: string): string {
	const match = line.match(WROTE_RE);
	const rawDateLine = match?.[1]?.trim() ?? "";
	return (
		rawDateLine
			.replace(/,\s*["']?[^,<"]+["']?\s*<[^>]+>\s*$/iu, "")
			.replace(
				/\b(?<capture1>[0-9]{1,2}:[0-9]{2}\s?(?:AM|PM))(?:,?\s+.*)?$/iu,
				"$1"
			)
			.trim() || "Unknown time"
	);
}

function getWroteAddress(line: string): string | undefined {
	return line.match(/<(?<capture1>[^>]+@[^>]+)>/u)?.[1];
}

class QuoteParser {
	splitOriginalMessage(
		lines: string[],
		markerIndex: number,
		options: SplitReplyContentOptions
	): ReplyContentParts {
		const latestContent = trimEmptyLines(lines.slice(0, markerIndex))
			.join("\n")
			.trim();
		const quotedLines = lines.slice(markerIndex + 1);
		const headers = new Map<string, string>();
		let contentStartIndex = 0;

		for (let index = 0; index < quotedLines.length; index += 1) {
			const line = quotedLines[index] ?? "";
			if (!line.trim()) {
				contentStartIndex = index + 1;
				break;
			}

			const match = line.match(HEADER_RE);
			if (match) {
				headers.set(match[1].toLowerCase(), match[2].trim());
				contentStartIndex = index + 1;
			}
		}

		const quotedContent = this.buildQuotedContent(
			stripSingleQuotePrefix(quotedLines.slice(contentStartIndex)),
			headers.get("date") ?? headers.get("sent") ?? "Unknown time",
			getPreviousMessageDirection(headers.get("from"), options.ownAddress),
			options
		);

		return { latestContent, quotedContent };
	}
	splitRepliedEmailContent(
		content: string | null | undefined,
		options: SplitReplyContentOptions = {}
	): ReplyContentParts {
		const lines = normalizeContent(content).split("\n");
		const originalMessageIndex = lines.findIndex((line) =>
			ORIGINAL_MESSAGE_RE.test(line.trim())
		);
		if (originalMessageIndex !== -1) {
			return this.splitOriginalMessage(lines, originalMessageIndex, options);
		}

		const underscoreSeparatorIndex = lines.findIndex((line) =>
			UNDERSCORE_SEPARATOR_RE.test(line.trim())
		);
		if (underscoreSeparatorIndex !== -1) {
			return this.splitSeparatorQuotedContent(
				lines,
				underscoreSeparatorIndex,
				options
			);
		}

		const wroteIndex = lines.findIndex((line) => WROTE_RE.test(line.trim()));
		if (wroteIndex !== -1) {
			const markerLine = lines[wroteIndex]?.trim() ?? "";
			const quotedLines = stripSingleQuotePrefix(lines.slice(wroteIndex + 1));
			return {
				latestContent: trimEmptyLines(lines.slice(0, wroteIndex))
					.join("\n")
					.trim(),
				quotedContent: this.buildQuotedContent(
					quotedLines,
					getWroteDateLine(markerLine),
					getPreviousMessageDirection(
						getWroteAddress(markerLine),
						options.ownAddress
					),
					options
				),
			};
		}

		const quoteIndex = lines.findIndex((line) => line.trim().startsWith(">"));
		if (quoteIndex !== -1) {
			const quotedLines = stripSingleQuotePrefix(lines.slice(quoteIndex));
			return {
				latestContent: trimEmptyLines(lines.slice(0, quoteIndex))
					.join("\n")
					.trim(),
				quotedContent: this.buildQuotedContent(
					quotedLines,
					"Unknown time",
					"received",
					options
				),
			};
		}

		return {
			latestContent: normalizeContent(content).trim(),
			quotedContent: [],
		};
	}
	buildQuotedContent(
		lines: string[],
		dateLine: string,
		direction: PreviousMessageDirection,
		options: SplitReplyContentOptions
	): QuotedEmailContent[] {
		const rawContent = trimEmptyLines(lines).join("\n").trim();
		if (!rawContent) {
			return [];
		}

		const nested = this.splitRepliedEmailContent(rawContent, options);
		const quotedContent: QuotedEmailContent = {
			content: nested.latestContent,
			dateLine,
			direction,
			quotedContent: nested.quotedContent,
		};

		return hasQuotedContent(quotedContent) ? [quotedContent] : [];
	}
	splitSeparatorQuotedContent(
		lines: string[],
		separatorIndex: number,
		options: SplitReplyContentOptions
	): ReplyContentParts {
		const quotedLines = trimEmptyLines(lines.slice(separatorIndex + 1));
		return {
			latestContent: trimEmptyLines(lines.slice(0, separatorIndex))
				.join("\n")
				.trim(),
			quotedContent: this.buildQuotedContent(
				quotedLines,
				getHeaderValue(quotedLines, "sent") ??
					getHeaderValue(quotedLines, "date") ??
					"Unknown time",
				getPreviousMessageDirection(
					getHeaderValue(quotedLines, "from"),
					options.ownAddress
				),
				options
			),
		};
	}
}

export function splitRepliedEmailContent(
	content: string | null | undefined,
	options: SplitReplyContentOptions = {}
): ReplyContentParts {
	return new QuoteParser().splitRepliedEmailContent(content, options);
}

export function getLatestEmailContent(
	content: string | null | undefined
): string {
	return splitRepliedEmailContent(content).latestContent;
}

export function htmlToReadableText(html: string | null | undefined): string {
	return (html ?? "")
		.replaceAll(/<(?<capture1>style|script|head)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
		.replaceAll(/<br\s*\/?>/giu, "\n")
		.replaceAll(/<\/(?<capture1>p|div|li|tr|blockquote|h[1-6])>/giu, "\n")
		.replaceAll(/<[^>]+>/gu, " ")
		.replaceAll("&nbsp;", " ")
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'");
}
