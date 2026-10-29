import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { copyMessageAttachments } from "@/lib/email/attachments";
import { buildSnippet } from "@/lib/email/parse";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

import type { DraftPayload } from "./types";
import { getDraftSender } from "./utils";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const url = new URL(request.url);
	const mailboxId = url.searchParams.get("mailboxId");
	const db = getDb(env);
	const conditions = [
		eq(messages.userId, user.id),
		eq(messages.direction, "outbound" as const),
		eq(messages.status, "draft"),
	];
	if (mailboxId) {
		conditions.push(eq(messages.mailboxId, mailboxId));
	}

	const rows = await db
		.select()
		.from(messages)
		.where(and(...conditions))
		.orderBy(desc(messages.createdAt))
		.limit(100);

	return NextResponse.json({ drafts: rows });
}

export async function POST(request: Request) {
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
	const sender = await getDraftSender(env, user.id, input);
	if ("error" in sender) {
		return NextResponse.json({ error: sender.error }, { status: 403 });
	}
	// Forwarding: the source must be readable by this user before its files are copied.
	let forwardSourceId: string | null = null;
	if (input.forwardOfMessageId) {
		const [source] = await db
			.select({ id: messages.id, mailboxId: messages.mailboxId })
			.from(messages)
			.where(eq(messages.id, input.forwardOfMessageId))
			.limit(1);
		const sourceAccess = source?.mailboxId
			? await getMailboxAccessLevel(db, user, source.mailboxId)
			: null;
		if (!source || !sourceAccess?.canRead) {
			return NextResponse.json({ error: "Message not found" }, { status: 404 });
		}
		forwardSourceId = source.id;
	}

	const draftId = newId("msg");
	const text = input.text ?? "";
	const html = input.html ?? "";

	const buildDraftValues = () => ({
		bccAddr: input.bcc || null,
		ccAddr: input.cc || null,
		direction: "outbound" as const,
		fromAddr: sender.fromAddr,
		htmlBody: html || null,
		id: draftId,
		inReplyTo: input.inReplyTo || null,
		mailboxId: sender.mailboxId,
		read: true,
		references: input.references || null,
		snippet: buildSnippet(text || null, html || null),
		status: "draft",
		subject: input.subject ?? null,
		textBody: text || null,
		threadId: input.threadId || null,
		toAddr: input.to ?? "",
		userId: user.id,
	});
	await db.insert(messages).values(buildDraftValues());

	const attachments = forwardSourceId
		? await copyMessageAttachments(env, forwardSourceId, draftId)
		: [];
	return NextResponse.json({ draft: { attachments, id: draftId } });
}
