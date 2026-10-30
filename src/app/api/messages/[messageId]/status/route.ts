import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { updateMessageStatusForUser } from "@/lib/user";

import type { MessageStatusPayload } from "./types";
import { isAllowedMessageStatus } from "./utils";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ messageId: string }> }
) {
	const { messageId } = await params;
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const payload = (await request.json()) as MessageStatusPayload;
	if (!isAllowedMessageStatus(payload.status)) {
		return Response.json({ error: "Invalid message status" }, { status: 400 });
	}

	const success = await updateMessageStatusForUser(
		env,
		user,
		messageId,
		payload.status
	);
	if (!success) {
		return Response.json({ error: "Message not found" }, { status: 404 });
	}

	return Response.json({ success: true });
}
