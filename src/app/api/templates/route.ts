import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { buildSnippet } from "@/lib/email/parse";
import { newId } from "@/lib/ids";

import { getDraftSender } from "../drafts/utils";

// Templates are outbound messages with status "template": they look like drafts
// in the database but no draft, folder or count query ever selects them.
export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const rows = await getDb(env)
		.select({
			htmlBody: messages.htmlBody,
			id: messages.id,
			subject: messages.subject,
			textBody: messages.textBody,
		})
		.from(messages)
		.where(
			and(eq(messages.userId, auth.user.id), eq(messages.status, "template"))
		)
		.orderBy(desc(messages.createdAt))
		.limit(200);
	return Response.json({ templates: rows });
}

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const input = (await request.json().catch(() => null)) as {
		mailboxId?: string | null;
		from?: string;
		title?: string;
		html?: string;
		text?: string;
	} | null;
	const title = input?.title?.trim().slice(0, 200);
	const html = input?.html ?? "";
	const text = input?.text ?? "";
	if (!title || !(html.trim() || text.trim())) {
		return Response.json(
			{ error: "Enter a title and content." },
			{ status: 400 }
		);
	}
	const sender = await getDraftSender(env, auth.user.id, {
		from: input?.from,
		mailboxId: input?.mailboxId,
	});
	if ("error" in sender) {
		return Response.json({ error: sender.error }, { status: 403 });
	}
	const id = newId("msg");
	const buildTemplateValues = () => ({
		direction: "outbound" as const,
		fromAddr: sender.fromAddr,
		htmlBody: html || null,
		id,
		mailboxId: sender.mailboxId,
		read: true,
		snippet: buildSnippet(text || null, html || null),
		status: "template",
		subject: title,
		textBody: text || null,
		toAddr: "",
		userId: auth.user.id,
	});
	await getDb(env).insert(messages).values(buildTemplateValues());
	return Response.json(
		{
			template: {
				htmlBody: html || null,
				id,
				subject: title,
				textBody: text || null,
			},
		},
		{ status: 201 }
	);
}
