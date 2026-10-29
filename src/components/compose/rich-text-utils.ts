/**
 * Helpers for the HTML composer. The editor owns one HTML string; the plain-text
 * alternative and the draft/send payloads are all derived from it, so there is
 * a single source of truth for what the message says.
 */

import { sanitizeEmailHtml } from "@/app/(dashboard)/inbox/[messageId]/email-html-sanitizer";

export const QUOTE_ATTRIBUTE = "data-mailflare-quote";
const QUOTE_OPEN = `<div class="mailflare-quote" ${QUOTE_ATTRIBUTE}="1">`;
const SIGNATURE_ATTRIBUTE = "data-mailflare-signature";

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/** Plain text as HTML: escaped, with line breaks preserved. */
export function textToHtml(text: string | null | undefined): string {
	const value = (text ?? "").replaceAll(/\r\n?/gu, "\n");
	if (!value) {
		return "";
	}
	return `<div>${escapeHtml(value).replaceAll("\n", "<br>")}</div>`;
}

/** Wrap quoted or forwarded content so the composer and reader can fold it. */
export function wrapQuotedHtml(inner: string): string {
	return `${QUOTE_OPEN}${inner}</div>`;
}

/** Split a stored HTML body into the editable part and the folded quote, if any. */
export function splitQuotedHtml(html: string | null | undefined): {
	body: string;
	quoted: string | null;
} {
	if (html === null || html === undefined) {
		return { body: "", quoted: null };
	}
	const value = html;
	const index = value.indexOf(QUOTE_OPEN);
	if (index === -1) {
		return { body: value, quoted: null };
	}
	const inner = value
		.slice(index + QUOTE_OPEN.length)
		.replace(/<\/div>\s*$/u, "");
	return { body: value.slice(0, index), quoted: inner };
}

export function joinQuotedHtml(body: string, quoted: string | null): string {
	return quoted ? `${body}${wrapQuotedHtml(quoted)}` : body;
}

const BLOCK_TAGS = new Set([
	"p",
	"div",
	"li",
	"tr",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"pre",
	"blockquote",
	"ul",
	"ol",
	"table",
]);

function renderNode(node: Node, state: RenderState): string {
	function renderChildren(element: Element, childState: RenderState): string {
		return [...element.childNodes]
			.map((child) => renderNode(child, childState))
			.join("");
	}

	if (node.nodeType === Node.TEXT_NODE) {
		return (node.textContent ?? "").replaceAll(/\s+/gu, " ");
	}
	if (node.nodeType !== Node.ELEMENT_NODE) {
		return "";
	}
	const element = node as HTMLElement;
	const tag = element.tagName.toLowerCase();
	if (tag === "br") {
		return "\n";
	}
	if (tag === "style" || tag === "script" || tag === "head") {
		return "";
	}

	if (tag === "ul" || tag === "ol") {
		const next: RenderState = {
			listDepth: state.listDepth + 1,
			ordered: [...state.ordered, tag === "ol" ? 0 : null],
		};
		const items = [...element.children]
			.map((child) => {
				const index = next.ordered.length - 1;
				if (next.ordered[index] !== null) {
					next.ordered[index] = (next.ordered[index] ?? 0) + 1;
				}
				const marker =
					next.ordered[index] === null ? "- " : `${next.ordered[index]}. `;
				const indent = "  ".repeat(state.listDepth);
				return `${indent}${marker}${renderChildren(child, next).trim()}`;
			})
			.join("\n");
		return `\n${items}\n`;
	}

	let inner = renderChildren(element, state);
	if (tag === "a") {
		const href = element.getAttribute("href") ?? "";
		if (href && href !== inner.trim() && !href.startsWith("mailto:")) {
			inner = `${inner} (${href})`;
		}
	}
	if (tag === "blockquote") {
		const quoted = inner
			.trim()
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
		return `\n${quoted}\n`;
	}
	if (BLOCK_TAGS.has(tag)) {
		return `\n${inner}\n`;
	}
	return inner;
}

/**
 * The text/plain alternative of a composed message. Blocks become lines, lists
 * get bullets or numbers, blockquotes get the classic "> " prefix so reply
 * chains stay readable in text-only clients and in Mailflare's own reader.
 */
export function htmlToPlainText(html: string | null | undefined): string {
	if (!html) {
		return "";
	}
	if (typeof DOMParser === "undefined") {
		return html
			.replaceAll(/<br\s*\/?>/giu, "\n")
			.replaceAll(/<\/(?<capture1>p|div|li)>/giu, "\n")
			.replaceAll(/<[^>]+>/gu, "");
	}
	const doc = new DOMParser().parseFromString(
		`<body>${html}</body>`,
		"text/html"
	);
	const text = renderNode(doc.body, { listDepth: 0, ordered: [] });
	return text
		.replaceAll(/[ \t]+\n/gu, "\n")
		.replaceAll(/\n{3,}/gu, "\n\n")
		.trim();
}

/** True when the HTML carries something other than empty blocks and whitespace. */
export function hasMeaningfulHtml(html: string): boolean {
	return htmlToPlainText(html).trim().length > 0 || /<img\b/iu.test(html);
}

/** Distinguish stored HTML markup from existing plain-text signatures. */
export function isHtmlSignature(signature: string | null | undefined): boolean {
	return /<\/?[a-z][a-z0-9]*[\s>/]/iu.test(signature ?? "");
}

export function signatureToHtml(signature: string | null | undefined): string {
	const value = signature?.trim() ?? "";
	if (!value) {
		return "";
	}
	if (isHtmlSignature(value) && typeof DOMParser !== "undefined") {
		return sanitizeEmailHtml(value, { forOutgoing: true }) ?? "";
	}
	return textToHtml(value).replaceAll(/^<div>|<\/div>$/gu, "");
}

interface RenderState {
	listDepth: number;
	ordered: (number | null)[];
}

function signatureBlock(signature: string | null | undefined): string {
	const html = signatureToHtml(signature);
	return html ? `<div ${SIGNATURE_ATTRIBUTE}="1"><br><br>${html}</div>` : "";
}

/** Swap or append the mailbox signature, mirroring the plain-text behaviour. */
export function applyMailboxSignatureHtml(
	html: string,
	previousSignature: string | null | undefined,
	nextSignature: string | null | undefined
): string {
	const previousBlock = signatureBlock(previousSignature);
	const nextBlock = signatureBlock(nextSignature);
	if (previousBlock && html.includes(previousBlock)) {
		return html.replace(previousBlock, nextBlock);
	}
	if (!nextBlock || html.includes(nextBlock)) {
		return html;
	}
	return `${html}${nextBlock}`;
}
