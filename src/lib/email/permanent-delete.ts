import type { AppDatabase } from "@/db";
import { deleteMessageWithObjects } from "@/lib/email/message-cleanup";
import { createAuditLog } from "@/lib/mailboxes/audit";

interface DeletableMessage {
	id: string;
	mailboxId: string | null;
	rawR2Key: string | null;
	status: string;
}

/**
 * Permanently remove messages (row, raw MIME and attachment objects) and audit
 * each one. The audit row cannot point at the deleted message, since its
 * `message_id` is a foreign key, so the id travels in the metadata instead.
 */
export async function permanentlyDeleteMessages(
	env: CloudflareEnv,
	db: AppDatabase,
	actorUserId: string,
	rows: DeletableMessage[],
	source: "bulk" | "empty" | "retention"
): Promise<number> {
	for (const row of rows) {
		await deleteMessageWithObjects(env, db, row.id, row.rawR2Key);
		await createAuditLog(env, {
			action: "email.delete",
			actorUserId,
			mailboxId: row.mailboxId,
			metadata: {
				messageId: row.id,
				permanent: true,
				previousStatus: row.status,
				source,
			},
		});
	}
	return rows.length;
}
