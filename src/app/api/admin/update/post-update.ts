import { isNodeRuntime } from "@/lib/runtime";

import { authorizeAdminRequest, dispatchUpdateWorkflow } from "./utils";

export async function POST(request: Request) {
	const authorization = await authorizeAdminRequest(request);
	if (authorization.error) {
		return authorization.error;
	}
	if (isNodeRuntime(authorization.env)) {
		return Response.json(
			{
				error:
					"Self-hosted installs update by pulling the new container image and restarting.",
			},
			{ status: 400 }
		);
	}

	try {
		// assume it's already passed
		// const status = await getUpdateStatus(authorization.env);
		// if (!status.available) {
		// 	return Response.json({ error: "Mailflare is already up to date", ...status }, { status: 409 });
		// }

		const dispatch = await dispatchUpdateWorkflow();

		return Response.json({ ok: true, ...dispatch }, { status: 202 });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Could not trigger the update workflow";
		const status = message.includes("must be configured") ? 503 : 502;
		return Response.json({ error: message }, { status });
	}
}
