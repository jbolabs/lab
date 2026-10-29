import vinextHandler from "vinext/server/fetch-handler";

import { runAccountRetention } from "./src/lib/accounts/deletion";
import { processAgentDraftJob } from "./src/lib/agent/jobs/utils";
import { runAgentMaintenance } from "./src/lib/agent/maintenance";
import { hasValidSessionMutationOrigin } from "./src/lib/auth/origin";
import { getUserFromSession } from "./src/lib/auth/session";
import { runScheduledDatabaseBackup } from "./src/lib/backups/runner";
import { runDriveTrashRetention } from "./src/lib/drive/retention";
import {
	getAccountForwardingDestination,
	MAILFLARE_FORWARDED_HEADER,
} from "./src/lib/email/account-forwarding";
import { processInboundMessage, storeRawToR2 } from "./src/lib/email/inbound";
import type { InboundQueueMessage } from "./src/lib/email/inbound";
import { inboundAttachmentLimitReasonFromRaw } from "./src/lib/email/inbound-attachments";
import { resolveIncomingMail, forwardMessage } from "./src/lib/email/incoming";
import { processOutboundQueue } from "./src/lib/email/send";
import type { OutboundQueueMessage } from "./src/lib/email/send";
import { runTrashRetention } from "./src/lib/email/trash-retention";
import { processWebhookRetry } from "./src/lib/email/webhooks";
import type { WebhookRetryMessage } from "./src/lib/email/webhooks";
import { runJmapChangeRetention } from "./src/lib/jmap/changes";
import { getSessionTokenFromRequest } from "./src/lib/realtime/utils";
import { withoutHttpsUpgradeOnHttp } from "./src/lib/security/headers";
import { withStorage } from "./src/lib/storage";
import { isInboundQueueMessage, isWebhookRetryMessage } from "./worker-utils";

export { RealtimeHub } from "./src/lib/realtime/hub";

export default {
	async email(
		message: ForwardableEmailMessage,
		rawEnv: CloudflareEnv,
		_ctx: ExecutionContext
	) {
		const env = withStorage(rawEnv);
		try {
			if (message.rawSize > 25 * 1024 * 1024) {
				message.setReject(
					"Message rejected: raw email exceeds the 25 MiB receiving limit. Send a download link instead."
				);
				return;
			}
			// Domain routing rules are resolved here rather than in the queue because reject and
			// forward can only be actioned on the live ForwardableEmailMessage.
			const decision = await resolveIncomingMail(env, message.from, message.to);

			if (decision?.action === "reject") {
				message.setReject(
					decision.rejectReason ?? "Message rejected by routing rule"
				);
				return;
			}
			const raw = await new Response(message.raw).arrayBuffer();
			const attachmentLimitReason =
				await inboundAttachmentLimitReasonFromRaw(raw);
			if (attachmentLimitReason) {
				message.setReject(attachmentLimitReason);
				return;
			}

			if (decision?.action === "forward" && decision.forwardTo) {
				const forwarded = await forwardMessage(message, decision.forwardTo);
				// A forward rule drops the message unless it was explicitly asked to keep a copy.
				// If the forward itself failed we still store it, so mail is never silently lost.
				if (forwarded && !decision.keepCopy) {
					return;
				}
			}

			if (message.headers.get(MAILFLARE_FORWARDED_HEADER) !== "1") {
				const forwardingDestination = await getAccountForwardingDestination(
					env,
					message.to
				);
				if (forwardingDestination) {
					await forwardMessage(message, forwardingDestination);
				}
			}
			const rawR2Key = await storeRawToR2(env, message.from, message.to, raw);
			const payload: InboundQueueMessage = {
				from: message.from,
				headers: Object.fromEntries(message.headers),
				rawR2Key,
				to: message.to,
			};
			await env.INBOUND_QUEUE.send(payload);
		} catch (error) {
			console.error("Inbound enqueue failed", error);
			message.setReject("Processing failed");
		}
	},

	async fetch(request: Request, rawEnv: CloudflareEnv, ctx: ExecutionContext) {
		const env = withStorage(rawEnv);
		const url = new URL(request.url);
		if (url.pathname === "/api/realtime") {
			if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
				return new Response("Expected WebSocket upgrade", { status: 426 });
			}
			if (!hasValidSessionMutationOrigin(request)) {
				return new Response("Invalid origin", { status: 403 });
			}

			const user = await getUserFromSession(
				env,
				getSessionTokenFromRequest(request)
			);
			if (!user || user.disabled) {
				return new Response("Unauthorized", { status: 401 });
			}

			const hub = env.REALTIME.getByName(user.id);
			const hubRequest = new Request(
				"https://mailflare-realtime/connect",
				request
			);
			hubRequest.headers.set("X-Mailflare-Realtime-User", user.id);
			return hub.fetch(hubRequest);
		}

		return withoutHttpsUpgradeOnHttp(
			request,
			await vinextHandler.fetch(request, env, ctx)
		);
	},

	async queue(batch: MessageBatch, rawEnv: CloudflareEnv): Promise<void> {
		const env = withStorage(rawEnv);
		for (const msg of batch.messages) {
			try {
				if (isInboundQueueMessage(msg.body)) {
					await processInboundMessage(env, msg.body);
				} else if (
					typeof msg.body === "object" &&
					msg.body !== null &&
					(msg.body as { kind?: unknown }).kind === "agent.draft" &&
					typeof (msg.body as { jobId?: unknown }).jobId === "string"
				) {
					await processAgentDraftJob(
						env,
						(msg.body as { jobId: string }).jobId
					);
				} else if (isWebhookRetryMessage(msg.body)) {
					await processWebhookRetry(env, msg.body as WebhookRetryMessage);
				} else if (
					typeof msg.body === "object" &&
					msg.body !== null &&
					(msg.body as { kind?: unknown }).kind === "email.scheduled"
				) {
					await processOutboundQueue(env, msg.body as OutboundQueueMessage);
				} else {
					throw new Error("Unknown queue message type");
				}
				msg.ack();
			} catch (error) {
				console.error("Queue processing failed", {
					attempts: msg.attempts,
					error,
					rawR2Key: isInboundQueueMessage(msg.body)
						? msg.body.rawR2Key
						: undefined,
					recipient: isInboundQueueMessage(msg.body) ? msg.body.to : undefined,
				});
				msg.retry({ delaySeconds: 10 });
			}
		}
	},

	async scheduled(
		controller: ScheduledController,
		rawEnv: CloudflareEnv,
		ctx: ExecutionContext
	) {
		await Promise.resolve();
		const env = withStorage(rawEnv);
		if (controller.cron === "0 2 * * *") {
			ctx.waitUntil(
				runScheduledDatabaseBackup(env, new Date(controller.scheduledTime))
			);
		}
		ctx.waitUntil(runAgentMaintenance(env));
		ctx.waitUntil(runTrashRetention(env, new Date(controller.scheduledTime)));
		if (controller.cron === "0 2 * * *") {
			ctx.waitUntil(
				runAccountRetention(env, new Date(controller.scheduledTime))
			);
		}
		// Drive trash is emptied once a day, with the 02:00 UTC cron; the 5-minute cron is for queue-like upkeep.
		if (controller.cron === "0 2 * * *") {
			ctx.waitUntil(
				runDriveTrashRetention(env, new Date(controller.scheduledTime))
			);
		}
		if (controller.cron === "0 2 * * *") {
			ctx.waitUntil(
				runJmapChangeRetention(env, new Date(controller.scheduledTime))
			);
		}
	},
} satisfies ExportedHandler<CloudflareEnv>;
