/** CSS custom properties do not add px to numeric geometry as React style properties do. */
export function layoutLength(value: number | string | null | undefined) {
	return typeof value === "number" ? `${value}px` : value;
}
