import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { messages } from "@/db/schema";
import type { MessageFolder } from "@/hooks/types";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { scheduledMessageCondition } from "@/lib/email/scheduled";
import {
	getMailboxAccessLevel,
	listAccessibleMailboxIds,
} from "@/lib/mailboxes/access";

import type { MessageNavigationEntry } from "./types";

const folders = new Set<MessageFolder>([
	"inbox",
	"starred",
	"snoozed",
	"sent",
	"scheduled",
	"archived",
	"spam",
	"trash",
]);

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const params = new URL(request.url).searchParams;
	const folder = params.get("folder") as MessageFolder | null;
	if (!folder || !folders.has(folder)) {
		return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
	}

	const mailboxId = params.get("mailboxId");
	const folderId = params.get("folderId");
	const grouped = params.get("group") === "thread";
	const db = getDb(env);
	const conditions: (SQL | undefined)[] = [];
	const applyMailboxScope = async () => {
		if (mailboxId) {
			const access = await getMailboxAccessLevel(db, user, mailboxId);
			if (!access?.canRead) {
				return NextResponse.json(
					{ error: "Mailbox not found" },
					{ status: 404 }
				);
			}
			conditions.push(eq(messages.mailboxId, mailboxId));
		} else {
			const accessibleIds = await listAccessibleMailboxIds(db, user);
			conditions.push(
				accessibleIds.length > 0
					? inArray(messages.mailboxId, accessibleIds)
					: eq(messages.userId, user.id)
			);
		}
	};
	const response1 = await applyMailboxScope();
	if (response1 !== undefined) {
		return response1;
	}

	if (folder === "inbox") {
		conditions.push(
			eq(messages.direction, "inbound"),
			eq(messages.status, "received")
		);
		if (!folderId) {
			conditions.push(
				isNull(messages.folderId),
				or(
					isNull(messages.snoozedUntil),
					lte(messages.snoozedUntil, new Date())
				)
			);
		}
	} else if (folder === "starred") {
		conditions.push(eq(messages.starred, true));
	} else if (folder === "snoozed") {
		conditions.push(
			eq(messages.status, "received"),
			isNull(messages.folderId),
			gt(messages.snoozedUntil, new Date())
		);
	} else if (folder === "sent") {
		conditions.push(
			eq(messages.direction, "outbound"),
			eq(messages.status, "sent")
		);
	} else if (folder === "scheduled") {
		conditions.push(scheduledMessageCondition(db));
	} else {
		conditions.push(eq(messages.status, folder));
	}
	if (folderId) {
		conditions.push(eq(messages.folderId, folderId));
	}

	const rows = await db
		.select({
			direction: messages.direction,
			id: messages.id,
			read: messages.read,
			threadId: messages.threadId,
		})
		.from(messages)
		.where(and(...conditions))
		.orderBy(desc(messages.createdAt), desc(messages.id));

	const entries: MessageNavigationEntry[] = [];
	if (grouped) {
		const byThread = new Map<string, MessageNavigationEntry>();
		for (const row of rows) {
			const key = row.threadId ?? row.id;
			const unread = row.direction === "inbound" && !row.read;
			const existing = byThread.get(key);
			if (existing) {
				existing.unread ||= unread;
			} else {
				byThread.set(key, { id: row.id, unread });
			}
		}
		entries.push(...byThread.values());
	} else {
		entries.push(
			...rows.map((row) => ({
				id: row.id,
				unread: row.direction === "inbound" && !row.read,
			}))
		);
	}

	return NextResponse.json({ messages: entries });
}
