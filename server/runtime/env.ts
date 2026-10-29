import fs from "node:fs";
import nodePath from "node:path";

import { withStorage } from "@/lib/storage";

import { openFileBucket } from "./file-bucket";
import { openMailer } from "./mailer";
import type { Mailer, MailerConfig } from "./mailer";
import { openAssets, openRateLimiter } from "./misc";
import { openQueue } from "./queue";
import type { InProcessQueue } from "./queue";
import { RealtimeHubRegistry } from "./realtime";
import { openSqliteDatabase } from "./sqlite-database";
import type { SqliteDatabase } from "./sqlite-database";
import type { NodeRuntime } from "./types";

const { mkdirSync } = fs;
const { join, resolve } = nodePath;

function optional(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value || undefined;
}

function mailerConfig(): MailerConfig {
	const smtp = optional("SMTP_URL");
	if (smtp) {
		return { kind: "smtp", url: smtp };
	}
	const accountId = optional("CF_ACCOUNT_ID");
	const token = optional("CF_TOKEN");
	if (accountId && token) {
		return { accountId, kind: "cloudflare", token };
	}
	return { kind: "none" };
}

/**
 * Assemble a `CloudflareEnv` for the Node runtime from environment variables
 * and local resources. Everything the app reaches through `getEnv()` is here,
 * so application code does not know which platform it runs on.
 */
export function createNodeRuntime(): NodeRuntime {
	const dataDir = resolve(optional("DATA_DIR") ?? "./data");
	mkdirSync(join(dataDir, "blobs"), { recursive: true });

	const database = openSqliteDatabase(join(dataDir, "mailflare.sqlite"));
	const bucket = openFileBucket(join(dataDir, "blobs"));
	const mailer = openMailer(mailerConfig());
	const inboundQueue = openQueue("mailflare-inbound");
	const outboundQueue = openQueue("mailflare-outbound");
	const agentQueue = openQueue("mailflare-agent");
	const realtime = new RealtimeHubRegistry();
	const publicDir = resolve(optional("PUBLIC_DIR") ?? "./public");

	const env = {
		AGENT_QUEUE: agentQueue,
		AGENT_RATE_LIMIT: openRateLimiter(120, 60),
		AI_API_KEY: optional("AI_API_KEY"),
		AI_BASE_URL: optional("AI_BASE_URL"),
		AI_MODEL: optional("AI_MODEL"),
		APP_URL: optional("APP_URL")?.replace(/\/$/u, ""),
		ASSETS: openAssets(publicDir),
		B2_APPLICATION_KEY: optional("B2_APPLICATION_KEY"),
		B2_BUCKET: optional("B2_BUCKET"),
		B2_ENDPOINT: optional("B2_ENDPOINT"),
		B2_KEY_ID: optional("B2_KEY_ID"),
		BUCKET: bucket,
		CF_API_KEY: optional("CF_API_KEY"),
		CF_EMAIL: optional("CF_EMAIL"),
		CF_TOKEN: optional("CF_TOKEN"),
		DB: database,
		DEVICE_LOGIN_RATE_LIMIT: openRateLimiter(10, 60),
		EMAIL: mailer,
		GITHUB_UPDATE_REF: optional("GITHUB_UPDATE_REF"),
		GITHUB_UPDATE_REPO: optional("GITHUB_UPDATE_REPO"),
		GITHUB_UPDATE_TOKEN: optional("GITHUB_UPDATE_TOKEN"),
		IMAGES: undefined as unknown as CloudflareEnv["IMAGES"],
		INBOUND_QUEUE: inboundQueue,
		INBOUND_WEBHOOK_SECRET: optional("INBOUND_WEBHOOK_SECRET"),
		LOGIN_RATE_LIMIT: openRateLimiter(20, 60),
		// Marks the runtime for the few places that must behave differently.
		MAILFLARE_RUNTIME: "node",
		OUTBOUND_QUEUE: outboundQueue,
		REALTIME: realtime.namespace(),
		S3_ACCESS_KEY_ID:
			optional("S3_ACCESS_KEY_ID") ?? optional("AWS_ACCESS_KEY_ID"),
		S3_BUCKET: optional("S3_BUCKET"),
		S3_REGION: optional("S3_REGION") ?? optional("AWS_REGION"),
		S3_SECRET_ACCESS_KEY:
			optional("S3_SECRET_ACCESS_KEY") ?? optional("AWS_SECRET_ACCESS_KEY"),
		TURNSTILE_SECRET_KEY: optional("TURNSTILE_SECRET_KEY"),
		VAPID_PRIVATE_KEY: optional("VAPID_PRIVATE_KEY"),
		VAPID_PUBLIC_KEY: optional("VAPID_PUBLIC_KEY"),
		VAPID_SUBJECT: optional("VAPID_SUBJECT"),
		WORKER_SELF_REFERENCE:
			undefined as unknown as CloudflareEnv["WORKER_SELF_REFERENCE"],
	} as unknown as CloudflareEnv;
	const storageEnv = withStorage(env);
	realtime.bindEnv(storageEnv);

	return {
		agentQueue: agentQueue as unknown as InProcessQueue,
		dataDir,
		database: database as unknown as SqliteDatabase,
		env: storageEnv,
		inboundQueue: inboundQueue as unknown as InProcessQueue,
		mailer: mailer as unknown as Mailer,
		outboundQueue: outboundQueue as unknown as InProcessQueue,
		realtime,
	};
}
