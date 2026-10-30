import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";

import { withSecurityHeaders } from "@/lib/security/headers";

const handle = createStartHandler(defaultStreamHandler);
export default {
	async fetch(request: Request) {
		return withSecurityHeaders(request, await handle(request));
	},
};
