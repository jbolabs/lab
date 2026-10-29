import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
	domains,
	mailboxAliases,
	mailboxes,
	messages,
	outboundJobs,
	users,
} from "@/db/schema";
import { scheduleAutoDraft } from "@/lib/agent/jobs/utils";
import type { SessionUser } from "@/lib/auth/types";
import {
	getMessageContactNames,
	upsertContactFromAddress,
} from "@/lib/contacts/service";
import { getEmailAddress } from "@/lib/email/address";
import {
	listMessageAttachments,
	storeMessageAttachments,
} from "@/lib/email/attachments";
import { sendMailboxAutoReply } from "@/lib/email/auto-reply";
import { inboundAttachmentLimitReason } from "@/lib/email/inbound-attachments";
import { inboundMessageId } from "@/lib/email/inbound-id";
import { buildSnippet, parseRawMime } from "@/lib/email/parse";
import {
	resolveInboundAddress,
	resolveInboxRuleDestination,
} from "@/lib/email/routing";
import { normalizeMessageId } from "@/lib/email/thread-lookup";
import { resolveThreadId } from "@/lib/email/threading";
import { getUnsubscribeUrlFromRawR2Key } from "@/lib/email/unsubscribe";
import { dispatchWebhooks } from "@/lib/email/webhooks";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import {
	getMailboxNotificationUserIds,
	notifyUsersOfNewMessage,
} from "@/lib/realtime/utils";
import { getReputationKeys } from "@/lib/spam/analyzers/reputation";
import { analyzeSpam } from "@/lib/spam/engine";
import { recordReputationObservation } from "@/lib/spam/repository";

/** True when the address is a mailbox or alias owned by the user, so their own mail never counts as unread. */
async function isOwnAddress(
	db: ReturnType<typeof getDb>,
	userId: string,
	address: string
) {
	const at = address.lastIndexOf("@");
	if (at < 1) {
		return false;
	}
	const localPart = address.slice(0, at).toLowerCase();
	const hostname = address.slice(at + 1).toLowerCase();
	const [mailbox] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(
			and(
				eq(mailboxes.userId, userId),
				eq(mailboxes.localPart, localPart),
				eq(domains.hostname, hostname)
			)
		)
		.limit(1);
	if (mailbox) {
		return true;
	}
	const [alias] = await db
		.select({ id: mailboxAliases.id })
		.from(mailboxAliases)
		.innerJoin(mailboxes, eq(mailboxAliases.mailboxId, mailboxes.id))
		.innerJoin(domains, eq(mailboxAliases.domainId, domains.id))
		.where(
			and(
				eq(mailboxes.userId, userId),
				eq(mailboxAliases.localPart, localPart),
				eq(domains.hostname, hostname)
			)
		)
		.limit(1);
	return Boolean(alias);
}

export interface InboundQueueMessage {
	from: string;
	to: string;
	rawR2Key: string;
	headers?: Record<string, string>;
}

export async function processInboundMessage(
	env: CloudflareEnv,
	payload: InboundQueueMessage
): Promise<void> {
	const db = getDb(env);
	// The sender is passed so that sender-based block rules resolve the same way here as they
	// do in the Worker email handler.
	const decision = await resolveInboundAddress(db, payload.to, payload.from);

	if (!decision) {
		console.warn(`No routing for inbound address: ${payload.to}`);
		return;
	}

	if (decision.action === "reject") {
		console.warn(`Rejected inbound: ${payload.to}`);
		return;
	}

	// A forward decision only reaches the queue when the rule keeps a copy; without a
	// destination mailbox there is nothing to store.
	if (decision.action === "forward" && !decision.keepCopy) {
		console.info(`Forward ${payload.to} -> ${decision.forwardTo}`);
		return;
	}

	if (!decision.mailbox) {
		return;
	}
	const [stored] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(
			and(
				eq(messages.mailboxId, decision.mailbox.mailboxId),
				eq(messages.rawR2Key, payload.rawR2Key)
			)
		)
		.limit(1);
	if (stored) {
		try {
			const [existing] = await db
				.select()
				.from(messages)
				.where(eq(messages.id, stored.id))
				.limit(1);
			if (existing && Date.now() - existing.createdAt.getTime() < 30 * 60_000) {
				await scheduleAutoDraft(env, {
					folderId: existing.folderId,
					headers: payload.headers,
					mailboxId: decision.mailbox.mailboxId,
					ownerUserId: decision.mailbox.userId,
					sender: existing.fromAddr,
					sourceMessageId: existing.id,
					spamAnalysisError: existing.spamAnalysisError,
					spamVerdict: existing.spamVerdict,
					status: existing.status,
				});
			}
		} catch (error) {
			console.error("Auto-draft recovery failed", error);
		}
		return;
	}

	const raw = await env.BUCKET.get(payload.rawR2Key);
	if (!raw) {
		console.error(`Missing R2 object: ${payload.rawR2Key}`);
		return;
	}

	const buffer = await raw.arrayBuffer();
	const parsed = await parseRawMime(buffer);
	const attachmentLimitReason = inboundAttachmentLimitReason(
		parsed.attachments
	);
	if (attachmentLimitReason) {
		console.warn(
			`Inbound attachment limit reached for ${payload.to}: ${attachmentLimitReason}`
		);
		await env.BUCKET.delete(payload.rawR2Key);
		return;
	}
	const { mailbox } = decision;
	const storeAndNotifyInboundMessage = async (): Promise<void> => {
		const messageId = await inboundMessageId(payload.rawR2Key);
		const snippet = buildSnippet(parsed.text, parsed.html);
		const deliveredAddress =
			getEmailAddress(payload.to) || `${mailbox.localPart}@${mailbox.hostname}`;
		// Keep the whole To header so reply-all can address everyone; rules and
		// webhooks still see the envelope recipient the message was delivered to.
		const toAddr = parsed.toAddr ?? payload.to;
		const fromAddr = parsed.fromAddr ?? payload.from;
		const destination = await resolveInboxRuleDestination(db, {
			content: [parsed.text, parsed.html, snippet].filter(Boolean).join(" "),
			fromAddress: fromAddr,
			mailboxId: mailbox.mailboxId,
			subject: parsed.subject,
			toAddress: payload.to,
		});
		let spamAnalysis: Awaited<ReturnType<typeof analyzeSpam>> | null = null;
		let spamAnalysisError: string | null = null;
		const [owner] = await db
			.select({ enabled: users.spamProtectionEnabled })
			.from(users)
			.where(eq(users.id, mailbox.userId))
			.limit(1);
		if (owner?.enabled !== false) {
			try {
				spamAnalysis = await analyzeSpam(db, {
					envelopeFrom: payload.from,
					headers: payload.headers,
					mailboxId: mailbox.mailboxId,
					message: parsed,
					userId: mailbox.userId,
				});
			} catch (error) {
				spamAnalysisError =
					error instanceof Error
						? error.message.slice(0, 300)
						: "Spam analysis failed";
				console.error(`Spam analysis failed for ${messageId}`, error);
			}
		}
		if (destination.status === "spam" && spamAnalysis) {
			spamAnalysis = {
				fingerprint: spamAnalysis?.fingerprint ?? "",
				score: 100,
				signals: [
					{
						id: "mailbox_rule_spam",
						reason: "A mailbox rule marked this message as spam",
						score: 100,
					},
				],
				verdict: "spam",
			};
		}
		const status =
			destination.status === "received" && spamAnalysis?.verdict === "spam"
				? "spam"
				: destination.status;
		const folderId = status === "spam" ? null : destination.folderId;
		const persistMessageAndNotify = async (): Promise<void> => {
			const contact = await upsertContactFromAddress(env, {
				address: fromAddr,
				source: "inbound",
				userId: mailbox.userId,
			});
			const sentByOwner = await isOwnAddress(
				db,
				mailbox.userId,
				getEmailAddress(fromAddr) || fromAddr
			).catch(() => false);
			let threadId: string;
			try {
				threadId = await resolveThreadId(db, {
					inReplyTo: parsed.inReplyTo,
					mailboxId: mailbox.mailboxId,
					messageId: parsed.messageId,
					references: parsed.references,
				});
			} catch (error) {
				console.error("Inbound thread lookup failed", {
					error,
					rawR2Key: payload.rawR2Key,
					recipient: payload.to,
					referenceCount: parsed.references.length,
				});
				threadId = normalizeMessageId(parsed.messageId) ?? newId("thr");
			}

			try {
				const inserted = await db
					.insert(messages)
					.values({
						ccAddr: parsed.ccAddr,
						direction: "inbound",
						folderId,
						fromAddr,
						htmlBody: parsed.html,
						id: messageId,
						inReplyTo: parsed.inReplyTo,
						mailboxId: mailbox.mailboxId,
						providerMessageId: parsed.messageId,
						rawR2Key: payload.rawR2Key,
						read: sentByOwner,
						references: parsed.references.length
							? parsed.references.join(" ")
							: null,
						replyTo: parsed.replyTo,
						snippet,
						spamAnalysisError,
						spamAnalyzedAt: spamAnalysis ? new Date() : null,
						spamScore: spamAnalysis?.score ?? null,
						spamSignals: spamAnalysis
							? JSON.stringify(spamAnalysis.signals)
							: null,
						spamVerdict: spamAnalysis?.verdict ?? null,
						status,
						subject: parsed.subject,
						textBody: parsed.text,
						threadId,
						toAddr,
						userId: mailbox.userId,
					})
					.onConflictDoNothing()
					.returning({ id: messages.id });
				if (!inserted.length) {
					return;
				}

				await storeMessageAttachments(env, messageId, parsed.attachments);
				if (spamAnalysis) {
					try {
						await recordReputationObservation(
							env,
							mailbox.mailboxId,
							getReputationKeys(parsed, spamAnalysis.fingerprint)
						);
					} catch (error) {
						console.error(
							`Spam reputation observation failed for ${messageId}`,
							error
						);
					}
					console.info(
						JSON.stringify({
							messageId,
							signals: spamAnalysis.signals.map((signal) => signal.id),
							spamScore: spamAnalysis.score,
							verdict: spamAnalysis.verdict,
						})
					);
				}
			} catch (error) {
				await db.delete(messages).where(eq(messages.id, messageId));
				throw error;
			}
			const notifyDeliveredMessage = async (): Promise<void> => {
				if (status === "received") {
					try {
						await sendMailboxAutoReply(env, {
							deliveredAddress,
							fromAddress: fromAddr,
							headers: payload.headers,
							incomingMessageId: parsed.messageId,
							mailboxId: mailbox.mailboxId,
							userId: mailbox.userId,
						});
					} catch (error) {
						console.error(
							`Auto-reply failed for mailbox ${mailbox.mailboxId}`,
							error
						);
					}
				}

				if (status === "spam") {
					console.info(`No notification for ${messageId}: filed as spam`);
				} else {
					const notificationUserIds = await getMailboxNotificationUserIds(
						env,
						mailbox.mailboxId,
						mailbox.userId
					);
					await notifyUsersOfNewMessage(env, notificationUserIds, {
						from: fromAddr,
						fromName: contact?.displayName ?? null,
						mailboxId: mailbox.mailboxId,
						messageId,
						subject: parsed.subject,
						type: "new_message",
					});
				}
				await dispatchWebhooks(env, mailbox.userId, "message.inbound", {
					cc: parsed.ccAddr ?? undefined,
					from: fromAddr,
					messageId,
					spamScore: spamAnalysis?.score,
					spamVerdict: spamAnalysis?.verdict,
					subject: parsed.subject,
					threadId,
					to: payload.to,
				});
				try {
					await scheduleAutoDraft(env, {
						folderId,
						headers: payload.headers,
						mailboxId: mailbox.mailboxId,
						ownerUserId: mailbox.userId,
						sender: fromAddr,
						sourceMessageId: messageId,
						spamAnalysisError,
						spamVerdict: spamAnalysis?.verdict,
						status,
					});
				} catch (error) {
					console.error("Auto-draft scheduling failed", error);
				}
			};
			return await notifyDeliveredMessage();
		};
		return await persistMessageAndNotify();
	};
	return await storeAndNotifyInboundMessage();
}

export async function storeRawToR2(
	env: CloudflareEnv,
	from: string,
	to: string,
	raw: ArrayBuffer
): Promise<string> {
	const key = `inbound/${Date.now()}-${newId()}.eml`;
	await env.BUCKET.put(key, raw, {
		customMetadata: { from, to },
		httpMetadata: { contentType: "message/rfc822" },
	});
	return key;
}

export async function getMessageWithBody(
	env: CloudflareEnv,
	userId: string,
	messageId: string
) {
	const db = getDb(env);
	const [message] = await db
		.select()
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);
	if (!message || message.userId !== userId) {
		return null;
	}
	const contactNames = await getMessageContactNames(
		env,
		userId,
		message.fromAddr,
		message.toAddr
	);
	const attachments = await listMessageAttachments(env, messageId);
	const unsubscribeUrl = await getUnsubscribeUrlFromRawR2Key(
		env,
		message.rawR2Key
	);
	const [scheduledJob] =
		message.direction === "outbound" && message.status === "queued"
			? await db
					.select({ scheduledAt: outboundJobs.scheduledAt })
					.from(outboundJobs)
					.where(
						and(
							eq(outboundJobs.messageId, messageId),
							eq(outboundJobs.status, "queued"),
							isNotNull(outboundJobs.scheduledAt)
						)
					)
					.limit(1)
			: [];
	return {
		attachments,
		body: message,
		message: { ...message, ...contactNames },
		scheduledAt: scheduledJob?.scheduledAt?.toISOString() ?? null,
		unsubscribeUrl,
	};
}

export async function getMessageWithBodyForUser(
	env: CloudflareEnv,
	user: SessionUser,
	messageId: string
) {
	const db = getDb(env);
	const [message] = await db
		.select()
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);
	if (!message?.mailboxId) {
		return null;
	}
	const access = await getMailboxAccessLevel(db, user, message.mailboxId);
	if (!access?.canRead) {
		return null;
	}
	const contactNames = await getMessageContactNames(
		env,
		message.userId,
		message.fromAddr,
		message.toAddr
	);
	const attachments = await listMessageAttachments(env, messageId);
	const unsubscribeUrl = await getUnsubscribeUrlFromRawR2Key(
		env,
		message.rawR2Key
	);
	return {
		attachments,
		body: message,
		message: { ...message, ...contactNames },
		unsubscribeUrl,
	};
}

export async function getMessageMetadataForUser(
	env: CloudflareEnv,
	user: SessionUser,
	messageId: string
) {
	const db = getDb(env);
	const [message] = await db
		.select({ mailboxId: messages.mailboxId, rawR2Key: messages.rawR2Key })
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);
	if (!message?.mailboxId) {
		return null;
	}
	const access = await getMailboxAccessLevel(db, user, message.mailboxId);
	if (!access?.canRead) {
		return null;
	}
	const [attachments, unsubscribeUrl] = await Promise.all([
		listMessageAttachments(env, messageId),
		getUnsubscribeUrlFromRawR2Key(env, message.rawR2Key),
	]);
	return { attachments, unsubscribeUrl };
}
