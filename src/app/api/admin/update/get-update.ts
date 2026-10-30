import { authorizeAdminRequest, getUpdateStatus } from "./utils";

export async function GET(request: Request) {
	const authorization = await authorizeAdminRequest(request);
	if (authorization.error) {
		return authorization.error;
	}

	try {
		return Response.json(await getUpdateStatus(authorization.env));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not check for updates";
		const status = message.includes("must be configured") ? 503 : 502;
		return Response.json({ error: message }, { status });
	}
}
