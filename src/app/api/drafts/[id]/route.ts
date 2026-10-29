import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { agentDraftMetadata, messages } from "@/db/schema";
import { parseAgentScheduledAt } from "@/lib/agent/schedule";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { listMessageAttachments } from "@/lib/email/attachments";
import { deleteMessageWithObjects } from "@/lib/email/message-cleanup";
import { buildSnippet } from "@/lib/email/parse";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";

import { getDraftSender, userOwnsDraft } from "../utils";
import type { DraftPayload, DraftRouteParams } from "./types";
import { selectDraftWithBody } from "./utils";

export async function GET(request: Request, { params }: DraftRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const draft = await selectDraftWithBody(db, user.id, id);

	if (!draft) {
		return NextResponse.json({ error: "Draft not found" }, { status: 404 });
	}

	const attachments = await listMessageAttachments(env, id);
	const [agent] = await db
		.select()
		.from(agentDraftMetadata)
		.where(eq(agentDraftMetadata.draftId, id))
		.limit(1);
	return NextResponse.json({
		draft: {
			...draft,
			agent: agent
				? {
						origin: agent.origin,
						revision: agent.revision,
						scheduledAt: agent.scheduledAt?.toISOString() ?? null,
					}
				: null,
			attachments,
		},
	});
}

export async function PATCH(request: Request, { params }: DraftRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	let input: DraftPayload;
	try {
		input = await readJsonBody<DraftPayload>(request, 1024 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return NextResponse.json({ error: "Invalid draft request" }, { status });
	}
	const db = getDb(env);
	const [draft] = await db
		.select()
		.from(messages)
		.where(eq(messages.id, id))
		.limit(1);

	if (!userOwnsDraft(draft, user.id)) {
		return NextResponse.json({ error: "Draft not found" }, { status: 404 });
	}
	const [agent] = await db
		.select({ mailboxId: agentDraftMetadata.mailboxId })
		.from(agentDraftMetadata)
		.where(eq(agentDraftMetadata.draftId, id))
		.limit(1);
	if (agent && input.mailboxId !== agent.mailboxId) {
		return NextResponse.json(
			{ error: "Agent draft mailbox cannot be changed" },
			{ status: 409 }
		);
	}
	let scheduledAt: Date | null | undefined;
	if (agent && input.scheduledAt !== undefined) {
		try {
			scheduledAt = parseAgentScheduledAt(input.scheduledAt);
		} catch (error) {
			return NextResponse.json(
				{ error: error instanceof Error ? error.message : "Invalid schedule" },
				{ status: 400 }
			);
		}
	}
	const sender = await getDraftSender(env, user.id, input);
	if ("error" in sender) {
		return NextResponse.json({ error: sender.error }, { status: 403 });
	}

	const text = input.text ?? "";
	const html = input.html ?? "";
	const buildDraftChanges = () => ({
		bccAddr: input.bcc || null,
		ccAddr: input.cc || null,
		fromAddr: sender.fromAddr,
		htmlBody: html || null,
		mailboxId: sender.mailboxId,
		snippet: buildSnippet(text || null, html || null),
		subject: input.subject ?? null,
		textBody: text || null,
		toAddr: input.to ?? "",
	});
	await db.update(messages).set(buildDraftChanges()).where(eq(messages.id, id));
	await db
		.update(agentDraftMetadata)
		.set({
			humanEditedAt: new Date(),
			revision: sql`${agentDraftMetadata.revision} + 1`,
			...(scheduledAt === undefined ? {} : { scheduledAt }),
		})
		.where(eq(agentDraftMetadata.draftId, id));

	return NextResponse.json({ draft: { id } });
}

export async function DELETE(request: Request, { params }: DraftRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const [draft] = await db
		.select()
		.from(messages)
		.where(eq(messages.id, id))
		.limit(1);

	if (!userOwnsDraft(draft, user.id)) {
		return NextResponse.json({ error: "Draft not found" }, { status: 404 });
	}

	await deleteMessageWithObjects(env, db, id, draft.rawR2Key);
	return NextResponse.json({ ok: true });
}
