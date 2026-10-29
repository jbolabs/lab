import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { agentJobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

interface Params {
	params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const { id } = await params;
	const db = getDb(env);
	const [job] = await db
		.select()
		.from(agentJobs)
		.where(eq(agentJobs.id, id))
		.limit(1);
	const access =
		job && job.reviewerUserId === user.id
			? await getMailboxAccessLevel(db, user, job.mailboxId)
			: null;
	if (!job || !access?.canSendOnBehalf) {
		return Response.json({ error: "Job not found" }, { status: 404 });
	}
	if (job.status !== "failed") {
		return Response.json({ error: "Job cannot be retried" }, { status: 409 });
	}
	await db
		.update(agentJobs)
		.set({
			attempts: 0,
			leaseUntil: null,
			nextAttemptAt: new Date(),
			reason: null,
			status: "pending",
		})
		.where(and(eq(agentJobs.id, id), eq(agentJobs.status, "failed")));
	await env.AGENT_QUEUE?.send({ jobId: id, kind: "agent.draft" });
	return Response.json({ ok: true });
}
