import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { getMessageWithBodyForUser } from "@/lib/email/inbound";

interface MessageRouteParams {
	params: Promise<{ messageId: string }>;
}

export async function GET(request: Request, { params }: MessageRouteParams) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { messageId } = await params;
	const data = await getMessageWithBodyForUser(env, user, messageId);
	if (!data) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	return Response.json(data);
}
