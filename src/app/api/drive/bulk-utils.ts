/** Keep D1 statements below the bound-parameter limit. */
export function chunks<T>(values: readonly T[], size = 50): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		result.push(values.slice(index, index + size));
	}
	return result;
}
