import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
	agentDraftMetadata,
	agentSendApprovals,
	messageAttachments,
	messages,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { loadMessageAttachmentContents } from "@/lib/email/attachments";
import { sendEmail } from "@/lib/email/send";
import { getAuthorizedSenderAddress } from "@/lib/email/sender";
import { newId } from "@/lib/ids";
import { requireValue } from "@/lib/require-value";

import type { AgentSendSnapshot } from "./types";

async function sha256(value: ArrayBuffer | string) {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function currentDraft(
	env: CloudflareEnv,
	user: SessionUser,
	draftId: string
) {
	const db = getDb(env);
	const [draft] = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.id, draftId),
				eq(messages.userId, user.id),
				eq(messages.status, "draft")
			)
		)
		.limit(1);
	if (!draft?.mailboxId) {
		throw new Error("Draft not found");
	}
	const [metadata] = await db
		.select()
		.from(agentDraftMetadata)
		.where(eq(agentDraftMetadata.draftId, draftId))
		.limit(1);
	if (!metadata) {
		throw new Error("Agent draft not found");
	}
	await getAuthorizedSenderAddress(env, {
		from: draft.fromAddr,
		mailboxId: draft.mailboxId,
		userId: user.id,
	});
	return { draft, metadata };
}

async function snapshot(
	env: CloudflareEnv,
	draft: typeof messages.$inferSelect,
	scheduledAt: Date | null
): Promise<{ payload: AgentSendSnapshot; hash: string }> {
	const db = getDb(env);
	const rows = await db
		.select()
		.from(messageAttachments)
		.where(eq(messageAttachments.messageId, draft.id));
	const attachments: AgentSendSnapshot["attachments"] = [];
	for (const row of rows) {
		const object = await env.BUCKET.get(row.r2Key);
		if (!object) {
			throw new Error("Draft attachment missing");
		}
		attachments.push({
			digest: await sha256(await object.arrayBuffer()),
			filename: row.filename,
			id: row.id,
			size: row.size,
		});
	}
	attachments.sort((a, b) => a.id.localeCompare(b.id));
	const payload: AgentSendSnapshot = {
		attachments,
		bcc: draft.bccAddr,
		cc: draft.ccAddr,
		from: draft.fromAddr,
		html: draft.htmlBody,
		inReplyTo: draft.inReplyTo,
		mailboxId: requireValue(draft.mailboxId),
		references: draft.references,
		scheduledAt: scheduledAt?.toISOString() ?? null,
		subject: draft.subject ?? "",
		text: draft.textBody,
		threadId: draft.threadId,
		to: draft.toAddr,
	};
	if (
		!payload.to.trim() ||
		!payload.subject.trim() ||
		!(payload.text?.trim() || payload.html?.trim())
	) {
		throw new Error("Draft is incomplete");
	}
	return { hash: await sha256(JSON.stringify(payload)), payload };
}

export async function requestAgentSend(
	env: CloudflareEnv,
	user: SessionUser,
	draftId: string,
	expectedRevision: number,
	requestKeyId?: string,
	id = newId("approval")
) {
	const { draft, metadata } = await currentDraft(env, user, draftId);
	if (metadata.revision !== expectedRevision) {
		throw new Error("Draft changed; reopen it for review");
	}
	if (metadata.scheduledAt && metadata.scheduledAt.getTime() <= Date.now()) {
		throw new Error(
			"Scheduled time has passed; update the draft before review"
		);
	}
	const [existing] = await getDb(env)
		.select({ id: agentSendApprovals.id })
		.from(agentSendApprovals)
		.where(
			and(
				eq(agentSendApprovals.draftId, draftId),
				inArray(agentSendApprovals.status, ["claimed", "sent", "unknown"])
			)
		)
		.limit(1);
	if (existing) {
		throw new Error(
			"This draft has a delivery already in progress or awaiting reconciliation"
		);
	}
	const { payload, hash } = await snapshot(env, draft, metadata.scheduledAt);
	const expiresAt = new Date(Date.now() + 15 * 60_000);
	await getDb(env)
		.insert(agentSendApprovals)
		.values({
			draftId,
			expiresAt,
			id,
			mailboxId: requireValue(draft.mailboxId),
			payloadHash: hash,
			requestKeyId: requestKeyId ?? null,
			revision: expectedRevision,
			userId: user.id,
		})
		.onConflictDoNothing({ target: agentSendApprovals.id });
	return {
		approvalId: id,
		expiresAt,
		reviewUrl: `/agent/review/${id}`,
		snapshot: payload,
		status: "pending_approval",
	};
}

export async function getAgentSendRequest(
	env: CloudflareEnv,
	user: SessionUser,
	approvalId: string
) {
	const [approval] = await getDb(env)
		.select()
		.from(agentSendApprovals)
		.where(
			and(
				eq(agentSendApprovals.id, approvalId),
				eq(agentSendApprovals.userId, user.id)
			)
		)
		.limit(1);
	if (!approval) {
		throw new Error("Approval not found");
	}
	let current: AgentSendSnapshot | null = null;
	let stale = false;
	if (approval.status === "pending") {
		try {
			const { draft, metadata } = await currentDraft(
				env,
				user,
				approval.draftId
			);
			const read = await snapshot(env, draft, metadata.scheduledAt);
			stale =
				metadata.revision !== approval.revision ||
				read.hash !== approval.payloadHash ||
				!!(
					metadata.scheduledAt && metadata.scheduledAt.getTime() <= Date.now()
				);
			if (!stale) {
				current = read.payload;
			}
		} catch {
			stale = true;
		}
	}
	return {
		approvalId,
		draftId: approval.draftId,
		expiresAt: approval.expiresAt,
		messageId: approval.messageId,
		snapshot: current,
		stale,
		status: approval.status,
	};
}

export async function confirmAgentSend(
	env: CloudflareEnv,
	user: SessionUser,
	approvalId: string,
	publicOrigin?: string
) {
	const db = getDb(env);
	const [approval] = await db
		.select()
		.from(agentSendApprovals)
		.where(
			and(
				eq(agentSendApprovals.id, approvalId),
				eq(agentSendApprovals.userId, user.id)
			)
		)
		.limit(1);
	if (!approval) {
		throw new Error("Approval not found");
	}
	if (approval.status !== "pending") {
		return { messageId: approval.messageId, status: approval.status };
	}
	if (approval.expiresAt < new Date()) {
		await db
			.update(agentSendApprovals)
			.set({ status: "expired" })
			.where(eq(agentSendApprovals.id, approvalId));
		throw new Error("Approval expired");
	}
	const { draft, metadata } = await currentDraft(env, user, approval.draftId);
	const current = await snapshot(env, draft, metadata.scheduledAt);
	if (
		metadata.revision !== approval.revision ||
		current.hash !== approval.payloadHash
	) {
		throw new Error("Draft changed; review it again");
	}
	if (metadata.scheduledAt && metadata.scheduledAt.getTime() <= Date.now()) {
		throw new Error(
			"Scheduled time has passed; update the draft before confirming"
		);
	}
	const claimed = await db
		.update(agentSendApprovals)
		.set({ claimedAt: new Date(), status: "claimed" })
		.where(
			and(
				eq(agentSendApprovals.id, approvalId),
				eq(agentSendApprovals.status, "pending")
			)
		)
		.returning({ id: agentSendApprovals.id });
	if (!claimed.length) {
		return getAgentSendRequest(env, user, approvalId);
	}
	try {
		const result = await sendEmail(env, {
			attachments: await loadMessageAttachmentContents(env, draft.id),
			bcc: draft.bccAddr || undefined,
			cc: draft.ccAddr || undefined,
			from: draft.fromAddr,
			html: draft.htmlBody || undefined,
			inReplyTo: draft.inReplyTo,
			mailboxId: requireValue(draft.mailboxId),
			publicOrigin,
			references: draft.references,
			scheduledAt: metadata.scheduledAt ?? undefined,
			subject: draft.subject || "",
			text: draft.textBody || undefined,
			threadId: draft.threadId,
			to: draft.toAddr,
			userId: user.id,
		});
		await db
			.update(agentSendApprovals)
			.set({ messageId: result.messageId, status: "sent" })
			.where(eq(agentSendApprovals.id, approvalId));
		await db
			.update(messages)
			.set({ status: "trash" })
			.where(and(eq(messages.id, draft.id), eq(messages.status, "draft")));
		return {
			messageId: result.messageId,
			scheduled: !!result.scheduled,
			status: "sent",
		};
	} catch (error) {
		await db
			.update(agentSendApprovals)
			.set({ status: "unknown" })
			.where(eq(agentSendApprovals.id, approvalId));
		throw new Error(
			`Delivery outcome needs review: ${error instanceof Error ? error.message : "provider error"}`,
			{ cause: error }
		);
	}
}

// A stable approval identity makes concurrent calls and retries share the same delivery claim.
export async function sendAgentDraft(
	env: CloudflareEnv,
	user: SessionUser,
	draftId: string,
	expectedRevision: number,
	requestKeyId: string,
	publicOrigin?: string
) {
	const id = `direct_${draftId}_${expectedRevision}`;
	const [existing] = await getDb(env)
		.select({ id: agentSendApprovals.id })
		.from(agentSendApprovals)
		.where(
			and(eq(agentSendApprovals.id, id), eq(agentSendApprovals.userId, user.id))
		)
		.limit(1);
	if (!existing) {
		await requestAgentSend(
			env,
			user,
			draftId,
			expectedRevision,
			requestKeyId,
			id
		);
	}
	return confirmAgentSend(env, user, id, publicOrigin);
}
