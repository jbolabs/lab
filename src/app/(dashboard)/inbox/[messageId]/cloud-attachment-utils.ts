import type {
	CloudAttachment,
	CloudAttachmentExtraction,
} from "./cloud-attachment-types";

const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/gu;
const OUTLOOK_CLOUD_ATTACHMENT_RE =
	/^\s*\[(?<capture1>https?:\/\/[^\]\s]+)\](?<capture2>[^<\r\n]+)<(?<capture3>https?:\/\/[^>\s]+)>\s*$/gmu;

function isMicrosoftCloudFileUrl(value: string): boolean {
	try {
		const hostname = new URL(value).hostname.toLowerCase();
		return (
			hostname === "1drv.ms" ||
			hostname === "onedrive.live.com" ||
			hostname.endsWith(".sharepoint.com")
		);
	} catch {
		return false;
	}
}

export function extractCloudAttachments(
	content: string
): CloudAttachmentExtraction {
	const normalized = content.replaceAll(ZERO_WIDTH_RE, "");
	const attachments: CloudAttachment[] = [];

	const body = normalized.replaceAll(
		OUTLOOK_CLOUD_ATTACHMENT_RE,
		(fullMatch, _iconUrl: string, rawFilename: string, fileUrl: string) => {
			if (!isMicrosoftCloudFileUrl(fileUrl)) {
				return fullMatch;
			}

			const filename = rawFilename.trim();
			if (!filename) {
				return fullMatch;
			}

			attachments.push({
				filename,
				id: `${fileUrl}-${attachments.length}`,
				provider: "OneDrive",
				url: fileUrl,
			});
			return "";
		}
	);

	return {
		attachments,
		content: body.replaceAll(/\n{3,}/gu, "\n\n").trim(),
	};
}
