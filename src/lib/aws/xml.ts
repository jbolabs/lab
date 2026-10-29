/** AWS Query and S3 responses are small flat XML documents; these helpers read them without a parser. */

const unescapeXml = (value: string) =>
	value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");

export function xmlTag(xml: string, name: string): string | null {
	const match = new RegExp(
		`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
		"u"
	).exec(xml);
	return match ? unescapeXml(match[1].trim()) : null;
}

export function xmlTags(xml: string, name: string): string[] {
	return [
		...xml.matchAll(
			new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gu")
		),
	].map((match) => unescapeXml(match[1].trim()));
}

/** Raw (still escaped) inner XML of each repeated element, for reading nested fields. */
export function xmlBlocks(xml: string, name: string): string[] {
	return [
		...xml.matchAll(
			new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gu")
		),
	].map((match) => match[1]);
}
