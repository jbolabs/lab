import { and, eq } from "drizzle-orm";

import { messages } from "@/db/schema";
import { loadMessageAttachmentContents } from "@/lib/email/attachments";
import { deleteMessageWithObjects } from "@/lib/email/message-cleanup";
import { sendEmail } from "@/lib/email/send";

import { listJmapMailboxes, listSendableAddresses } from "./access";
import { decodeIdentityId, identityId } from "./ids";
import { getEmailState } from "./state";
import type { JmapContext, JmapMethodHandler } from "./types";

/** One Identity per address the account may send from. */
export async function buildIdentities(ctx: JmapContext) {
	const list: Record<string, unknown>[] = [];
	for (const mailbox of await listJmapMailboxes(ctx)) {
		if (mailbox.permission === "read_only") {
			continue;
		}
		for (const address of await listSendableAddresses(ctx, mailbox)) {
			list.push({
				bcc: null,
				email: address,
				htmlSignature: "",
				id: identityId(mailbox.id, address),
				mayDelete: false,
				name: mailbox.displayName ?? "",
				replyTo: null,
				textSignature: "",
			});
		}
	}
	return list;
}

export { JmapError } from "./errors";

export const identityGet: JmapMethodHandler = async (ctx, args) => {
	const all = await buildIdentities(ctx);
	const ids = args.ids as string[] | null | undefined;
	const list = ids
		? all.filter((item) => ids.includes(item.id as string))
		: all;
	const found = new Set(list.map((item) => item.id as string));
	return {
		accountId: ctx.accountId,
		list,
		notFound: ids ? ids.filter((id) => !found.has(id)) : [],
		state: "identities",
	};
};

export const identityChanges: JmapMethodHandler = async () =>
	await {
		type: "cannotCalculateChanges",
	};

export const identitySet: JmapMethodHandler = async (ctx, args) =>
	await {
		accountId: ctx.accountId,
		created: {},
		destroyed: [],
		newState: "identities",
		notCreated: Object.fromEntries(
			Object.keys((args.create ?? {}) as object).map((id) => [
				id,
				{ type: "forbidden" },
			])
		),
		notDestroyed: Object.fromEntries(
			((args.destroy ?? []) as string[]).map((id) => [
				id,
				{ type: "forbidden" },
			])
		),
		notUpdated: Object.fromEntries(
			Object.keys((args.update ?? {}) as object).map((id) => [
				id,
				{ type: "forbidden" },
			])
		),
		oldState: "identities",
		updated: {},
	};

/**
 * EmailSubmission/set: send a draft. Mailflare's send writes a fresh Sent row,
 * so the draft is removed afterwards and the submission id is the sent
 * message's id; onSuccessDestroyEmail / onSuccessUpdateEmail are honoured
 * by reporting the draft as destroyed.
 */
export const emailSubmissionSet: JmapMethodHandler = async (ctx, args) => {
	const oldState = await getEmailState(ctx);
	const created: Record<string, unknown> = {};
	const notCreated: Record<string, unknown> = {};
	const destroyedEmails: string[] = [];

	for (const [creationId, value] of Object.entries(
		(args.create ?? {}) as Record<string, Record<string, unknown>>
	)) {
		const applyCreation = async () => {
			const emailId =
				ctx.createdIds[String(value.emailId).replace(/^#/u, "")] ??
				String(value.emailId ?? "");
			const identity =
				typeof value.identityId === "string"
					? decodeIdentityId(value.identityId)
					: null;
			const accessible = await listJmapMailboxes(ctx);
			if (
				!identity ||
				!accessible.some(
					(mailbox) =>
						mailbox.id === identity.mailboxId &&
						mailbox.permission !== "read_only"
				)
			) {
				notCreated[creationId] = {
					properties: ["identityId"],
					type: "invalidProperties",
				};
				return;
			}
			const [draft] = await ctx.db
				.select()
				.from(messages)
				.where(and(eq(messages.id, emailId), eq(messages.status, "draft")))
				.limit(1);
			if (
				!draft ||
				draft.userId !== ctx.auth.userId ||
				draft.mailboxId !== identity.mailboxId
			) {
				notCreated[creationId] = {
					description: "Not a draft of this account",
					properties: ["emailId"],
					type: "invalidProperties",
				};
				return;
			}
			try {
				const attachments = await loadMessageAttachmentContents(
					ctx.env,
					draft.id
				);
				const result = await sendEmail(ctx.env, {
					attachments,
					bcc: draft.bccAddr ?? undefined,
					cc: draft.ccAddr ?? undefined,
					from: identity.address,
					html: draft.htmlBody ?? undefined,
					inReplyTo: draft.inReplyTo,
					mailboxId: identity.mailboxId,
					publicOrigin: ctx.origin,
					references: draft.references,
					subject: draft.subject ?? "(no subject)",
					text: draft.textBody ?? undefined,
					threadId: draft.threadId,
					to: draft.toAddr,
					userId: ctx.auth.userId,
				});
				try {
					await deleteMessageWithObjects(
						ctx.env,
						ctx.db,
						draft.id,
						draft.rawR2Key
					);
				} catch (error) {
					// Sending is irreversible, so cleanup failure must not invite a retry
					// that could deliver the same message twice.
					console.error(
						`Failed to clean up submitted draft ${draft.id}`,
						error
					);
				}
				destroyedEmails.push(draft.id);
				ctx.createdIds[creationId] = result.messageId;
				created[creationId] = {
					deliveryStatus: null,
					dsnBlobIds: [],
					emailId: result.messageId,
					envelope: null,
					id: result.messageId,
					identityId: value.identityId,
					mdnBlobIds: [],
					sendAt: new Date().toISOString(),
					threadId: draft.threadId ?? result.messageId,
					undoStatus: "final",
				};
			} catch (error) {
				notCreated[creationId] = {
					description: error instanceof Error ? error.message : "Send failed",
					type: "forbidden",
				};
			}
		};
		await applyCreation();
	}

	return {
		// Surfaced so the processor can append the implicit Email/set response.
		__destroyedEmails: destroyedEmails,

		accountId: ctx.accountId,

		created,

		destroyed: [],

		newState: await getEmailState(ctx),

		notCreated,

		notDestroyed: Object.fromEntries(
			((args.destroy ?? []) as string[]).map((id) => [
				id,
				{ type: "forbidden" },
			])
		),

		notUpdated: Object.fromEntries(
			Object.keys((args.update ?? {}) as object).map((id) => [
				id,
				{ type: "forbidden" },
			])
		),

		oldState,

		updated: {},
	};
};

export const emailSubmissionGet: JmapMethodHandler = async (ctx, args) => ({
	accountId: ctx.accountId,
	list: [],
	notFound: (args.ids ?? []) as string[],
	state: await getEmailState(ctx),
});

export const emailSubmissionQuery: JmapMethodHandler = async (ctx) => ({
	accountId: ctx.accountId,
	canCalculateChanges: false,
	ids: [],
	position: 0,
	queryState: await getEmailState(ctx),
	total: 0,
});

export const emailSubmissionChanges: JmapMethodHandler = async () =>
	await {
		type: "cannotCalculateChanges",
	};
