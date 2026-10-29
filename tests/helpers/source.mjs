/** Normalize layout around tokens without removing arguments or operators. */
export function normalizeSource(source) {
	return source
		.replaceAll(/\s+/gu, " ")
		.replaceAll(/\(\s+/gu, "(")
		.replaceAll(/,?\s+\)/gu, ")");
}
