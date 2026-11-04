import type { LabEnv } from "./alchemy.run";
import type { InboundQueueMessage } from "./src/lib/email/inbound";
import type { OutboundQueueMessage } from "./src/lib/email/send";
import type { WebhookRetryMessage } from "./src/lib/email/webhooks";
import type { RealtimeHub } from "./src/lib/realtime/hub";

declare global {
	/**
	 * The Worker's bindings come from the Alchemy stack (`LabEnv`); only their
	 * message and Durable Object types are narrowed here. Everything below them
	 * is optional configuration: set by the stack in prod, by an operator on
	 * other installs, or from the environment in the Node runtime (`server/`).
	 */
	interface CloudflareEnv extends Omit<
		LabEnv,
		"AGENT_QUEUE" | "INBOUND_QUEUE" | "OUTBOUND_QUEUE" | "REALTIME"
	> {
		ASSETS: Fetcher;
		AGENT_QUEUE: Queue<{ kind: "agent.draft"; jobId: string }>;
		INBOUND_QUEUE: Queue<InboundQueueMessage>;
		// The outbound queue also carries webhook retries so that scheduled redelivery needs no extra binding.
		OUTBOUND_QUEUE: Queue<OutboundQueueMessage | WebhookRetryMessage>;
		REALTIME: DurableObjectNamespace<RealtimeHub>;

		/** Public origin of this install (https://lab.example.com) when it sits behind a proxy. */
		APP_URL?: string;
		/** Script name that domain onboarding points each zone's catch-all at. */
		CF_EMAIL_WORKER_NAME?: string;
		CF_TOKEN?: string;
		CF_API_KEY?: string;
		CF_EMAIL?: string;
		/** Cloudflare account id, needed for the Email Sending REST API off Workers. */
		CF_ACCOUNT_ID?: string;
		/** Contact URI for VAPID, e.g. mailto:admin@example.com or https://lab.example.com. */
		VAPID_SUBJECT?: string;
		TURNSTILE_SECRET_KEY?: string;
		/** Resend and Amazon SES credentials; values saved in Admin > Domains take precedence. */
		RESEND_API_KEY?: string;
		AWS_ACCESS_KEY_ID?: string;
		AWS_SECRET_ACCESS_KEY?: string;
		AWS_REGION?: string;

		AI_MODEL?: string;
		AI_BASE_URL?: string;
		AI_API_KEY?: string;

		/** APNs auth key for native push (src/lib/push/native.ts). */
		APNS_KEY_ID?: string;
		APNS_TEAM_ID?: string;
		/** The .p8 file contents (PKCS#8 PEM). */
		APNS_PRIVATE_KEY?: string;
		/** Origin of a Mailflare push relay (mailflare-relay); lets this server push without APNS_* keys. */
		APNS_RELAY_URL?: string;

		/**
		 * Backblaze B2 storage. When all four are set, B2 replaces the R2 binding for raw mail, attachments, Drive,
		 * avatars, branding and backups. B2_ENDPOINT is the S3-compatible host, e.g. s3.us-west-004.backblazeb2.com.
		 */
		B2_KEY_ID?: string;
		B2_APPLICATION_KEY?: string;
		B2_BUCKET?: string;
		B2_ENDPOINT?: string;
		/**
		 * AWS S3 storage, used when B2 is not configured. Credentials fall back to AWS_ACCESS_KEY_ID /
		 * AWS_SECRET_ACCESS_KEY (read from the environment), so an existing SES key can serve both.
		 */
		S3_BUCKET?: string;
		S3_REGION?: string;
		S3_ACCESS_KEY_ID?: string;
		S3_SECRET_ACCESS_KEY?: string;

		GITHUB_UPDATE_TOKEN?: string;
		GITHUB_UPDATE_REF?: string;
		GITHUB_UPDATE_REPO?: string;

		/** "node" when served by the self-hosted runtime in server/; unset on Workers. */
		MAILFLARE_RUNTIME?: "node";
		/** Shared secret the Cloudflare email relay signs inbound webhooks with (self-hosted only). */
		INBOUND_WEBHOOK_SECRET?: string;
	}
}
