import { textToHtml } from "@/components/compose/rich-text-utils";

export function formatAgentDraftBody(body: string) {
	const text = body
		.replaceAll(/\r\n?/gu, "\n")
		.split("\n")
		.map((line) =>
			line
				.replace(/^\s*```[^\n]*$/u, "")
				.replace(/^\s{0,3}#{1,6}\s+/u, "")
				.replace(/^\s{0,3}[-*+]\s+/u, "• ")
				.replaceAll(
					/\[(?<capture1>[^\]]+)\]\((?<capture2>[^)\s]+)\)/gu,
					"$1 ($2)"
				)
				.replaceAll(/\*\*(?<capture1>[^*\n]+)\*\*/gu, "$1")
				.replaceAll(/__(?<capture1>[^_\n]+)__/gu, "$1")
				.replaceAll(/\*(?<capture1>[^*\n]+)\*/gu, "$1")
				.replaceAll(/_(?<capture1>[^_\n]+)_/gu, "$1")
				.replaceAll(/~~(?<capture1>[^~\n]+)~~/gu, "$1")
				.replaceAll(/`(?<capture1>[^`\n]+)`/gu, "$1")
		)
		.join("\n")
		.replaceAll(/\n{3,}/gu, "\n\n")
		.trim();
	return { html: textToHtml(text), text };
}
