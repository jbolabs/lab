import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { messageAttachments } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import { getEnv } from "@/lib/cloudflare";
import { streamDriveFile } from "@/lib/drive/content";
import type { DriveRow } from "@/lib/drive/types";
import { getAttachmentForUser } from "@/lib/email/attachments";

import type { DriveItemParams } from "../../../items/[id]/types";

/** Streams an email attachment for the Drive preview, with range support and a CSP that lets PDFs render. */
export async function GET(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) {
		return error;
	}
	const [row] = await getDb(env)
		.select({ messageId: messageAttachments.messageId })
		.from(messageAttachments)
		.where(eq(messageAttachments.id, id))
		.limit(1);
	const result = row
		? await getAttachmentForUser(env, user, row.messageId, id)
		: null;
	if (!result) {
		return new Response("Not found", { status: 404 });
	}
	const { attachment } = result;
	const file: DriveRow = {
		contentType: attachment.contentType,
		createdAt: attachment.createdAt,
		id: attachment.id,
		kind: "file",
		linkToken: null,
		name: attachment.filename,
		ownerId: row.messageId,
		parentId: null,
		r2Key: attachment.r2Key,
		size: attachment.size,
		trashedAt: null,
		updatedAt: attachment.createdAt,
		uploadFingerprint: null,
		uploadId: null,
		uploadPartSize: null,
	};
	return streamDriveFile(
		env,
		request,
		file,
		new URL(request.url).searchParams.get("download") === "1"
	);
}
