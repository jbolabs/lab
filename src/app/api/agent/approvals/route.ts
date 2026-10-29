import { z } from "zod";

import { requestAgentSend } from "@/lib/agent/approvals/utils";
import { getCurrentUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";

const schema = z.object({
	draftId: z.string().min(1),
	expectedRevision: z.number().int().positive(),
});

export async function POST(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}
	try {
		return Response.json(
			await requestAgentSend(
				env,
				user,
				parsed.data.draftId,
				parsed.data.expectedRevision
			)
		);
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error ? error.message : "Could not create approval",
			},
			{ status: 409 }
		);
	}
}
