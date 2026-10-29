import { z } from "zod";

import {
	listCloudflareAgentModels,
	listCompatibleAgentModels,
} from "@/lib/agent/provider-models";
import { requireSessionUser } from "@/lib/api/auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";

const requestSchema = z.object({
	apiKey: z.string().max(2000).optional(),
	baseUrl: z.string().max(500),
	preset: z.enum(["openai", "openrouter", "groq", "custom"]),
	provider: z.enum(["cloudflare", "compatible"]),
});

export async function POST(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) {
		return session.error;
	}
	if (!isPrimaryAdmin(session.user)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = requestSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid provider details" },
			{ status: 400 }
		);
	}
	try {
		const result =
			parsed.data.provider === "cloudflare"
				? await listCloudflareAgentModels(env)
				: await listCompatibleAgentModels(env, parsed.data);
		return Response.json(result, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return Response.json(
			{
				error: error instanceof Error ? error.message : "Unable to load models",
			},
			{ status: 400 }
		);
	}
}
