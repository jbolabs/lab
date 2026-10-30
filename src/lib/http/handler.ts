export function invokeHandler(
	handler: (...args: never[]) => Response | Promise<Response>,
	request: Request,
	params: Record<string, string | undefined>
) {
	const resolved = { ...params } as Record<string, string | string[]>;
	// JMAP's optional catch-all expects path segments; TanStack provides a splat string.
	if ("_splat" in params) {
		resolved.segments = params._splat?.split("/").filter(Boolean) ?? [];
	}
	const call = handler as (
		request: Request,
		context: { params: Promise<Record<string, string | string[]>> }
	) => Response | Promise<Response>;
	return call(request, { params: Promise.resolve(resolved) });
}
