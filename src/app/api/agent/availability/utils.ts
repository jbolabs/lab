import { getAgentEnabled } from "@/lib/agent/provider";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";

export async function GET(request: Request) {
	const env = getEnv();
	if (!(await getCurrentUser(env, request))) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return Response.json(
		{ enabled: await getAgentEnabled(env) },
		{ headers: { "Cache-Control": "no-store" } }
	);
}
