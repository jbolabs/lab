import { eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { messages } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

export function selectDraftWithBody(db: Db, userId: string, draftId: string) {
	return db
		.select({
			bccAddr: messages.bccAddr,
			ccAddr: messages.ccAddr,
			fromAddr: messages.fromAddr,
			htmlBody: messages.htmlBody,
			id: messages.id,
			inReplyTo: messages.inReplyTo,
			mailboxId: messages.mailboxId,
			references: messages.references,
			status: messages.status,
			subject: messages.subject,
			textBody: messages.textBody,
			threadId: messages.threadId,
			toAddr: messages.toAddr,
			userId: messages.userId,
		})
		.from(messages)
		.where(eq(messages.id, draftId))
		.limit(1)
		.then(([draft]) =>
			draft && draft.userId === userId && draft.status === "draft"
				? draft
				: null
		);
}
