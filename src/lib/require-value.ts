/** Fail at the boundary when a supposedly present value is missing. */
export function requireValue<T>(value: T | null | undefined): T {
	if (value === null || value === undefined) {
		throw new Error("Required value is missing");
	}
	return value;
}
