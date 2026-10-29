export function getAttachmentContentDisposition(
	filename: string,
	inline: boolean
): string {
	const safeFilename = filename.replaceAll(/["\\\r\n]/gu, "_");
	return `${inline ? "inline" : "attachment"}; filename="${safeFilename}"`;
}
