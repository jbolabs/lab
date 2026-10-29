/** React Compiler cannot compile try/finally in components; keep resource cleanup at this boundary. */
export async function withCleanup<T>(
	action: () => Promise<T>,
	cleanup: () => void | Promise<void>
): Promise<T> {
	try {
		return await action();
	} finally {
		await cleanup();
	}
}

/** Handle action errors and release optional pending state through the same cleanup boundary. */
export function runAsyncAction<T, U>(
	action: () => Promise<T>,
	onError: (error: unknown) => U | Promise<U>,
	onSettled?: () => void | Promise<void>
): Promise<T | U> {
	return withCleanup(
		async () => {
			try {
				return await action();
			} catch (error) {
				return await onError(error);
			}
		},
		() => onSettled?.()
	);
}

/** Validate the HTTP boundary before an interactive action consumes its response. */
export function requireSuccessfulResponse(
	response: Pick<Response, "ok">,
	message?: string
): void {
	if (!response.ok) {
		throw new Error(message);
	}
}

/** Require the entity promised by a successful mutation before updating local state. */
export function requireActionEntity<T extends object>(
	entity: T | null | undefined,
	message?: string
): T {
	if (!entity) {
		throw new Error(message);
	}
	return entity;
}
