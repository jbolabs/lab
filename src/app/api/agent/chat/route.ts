import { z } from "zod";

import { createAgentChatStream } from "@/lib/agent/chat";
import { agentProviderErrorMessage } from "@/lib/agent/errors";
import { allowAgentRequest } from "@/lib/agent/rate-limit";
import { getCurrentUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { readJsonBody } from "@/lib/http/request";
import { getRequestTimeZone } from "@/lib/time/utils";

const schema = z.object({
	conversationId: z.string().nullish(),
	currentMessageId: z.string().max(100).nullish(),
	mailboxId: z.string().min(1),
	text: z.string().trim().min(1).max(4000),
	timeZone: z.string().max(80).optional(),
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
	if (!(await allowAgentRequest(env, `chat:${user.id}`))) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}
	const raw = await readJsonBody(request, 8000).catch(() => null);
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}
	try {
		const { conversationId, stream } = await createAgentChatStream(
			{ env, mailboxId: parsed.data.mailboxId, origin: "chat", user },
			parsed.data.text,
			parsed.data.conversationId ?? undefined,
			request.signal,
			getRequestTimeZone(request, user.timeZone),
			parsed.data.currentMessageId ?? undefined
		);
		return new Response(stream, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "application/x-ndjson; charset=utf-8",
				"X-Conversation-Id": conversationId,
			},
		});
	} catch (error) {
		return Response.json(
			{ error: agentProviderErrorMessage(error) },
			{ status: 400 }
		);
	}
}
