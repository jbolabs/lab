import { stringifySetCookie } from "cookie";
import type { SerializeOptions } from "cookie";
/** Append rather than replace: login and account switching set multiple cookies. */
export function setResponseCookie(
	response: Response,
	name: string,
	value: string,
	options: SerializeOptions = {}
) {
	response.headers.append(
		"Set-Cookie",
		stringifySetCookie({ name, value, ...options })
	);
}
