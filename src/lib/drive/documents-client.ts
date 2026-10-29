export function isMarkdownFile(item: { name: string; contentType: string }) {
	return (
		item.contentType === "text/markdown" ||
		/\.(?:md|markdown)$/iu.test(item.name)
	);
}
