/**
 * Compile an operator-authored routing pattern. Rules are stored in the legacy (non-Unicode)
 * regex syntax, so the `u` flag would reject identity escapes such as `\@` and silently stop
 * existing rules from matching. Validation and matching must share this one compiler.
 */
export function compileRulePattern(pattern: string, flags = ""): RegExp {
	// oxlint-disable-next-line require-unicode-regexp -- Stored rules use the legacy syntax; see above.
	return new RegExp(pattern, flags);
}
