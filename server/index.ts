import { createServer } from "node:http";
import nodePath from "node:path";
import { parse } from "node:url";

import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { WebSocketServer } from "ws";

import { processAgentDraftJob } from "@/lib/agent/jobs/utils";
import { getUserFromSession } from "@/lib/auth/session";
import { processInboundMessage } from "@/lib/email/inbound";
import { processOutboundQueue } from "@/lib/email/send";
import type { OutboundQueueMessage } from "@/lib/email/send";
import { processWebhookRetry } from "@/lib/email/webhooks";
import type { WebhookRetryMessage } from "@/lib/email/webhooks";
import { getSessionTokenFromRequest } from "@/lib/realtime/utils";
import { withSecurityHeaders } from "@/lib/security/headers";

import { isInboundQueueMessage, isWebhookRetryMessage } from "../worker-utils";
import { createNodeRuntime } from "./runtime/env";
import { applyMigrations } from "./runtime/migrate";
import { startScheduler } from "./runtime/scheduler";
import { startSmtpListener } from "./runtime/smtp";

const { join, resolve } = nodePath;

/**
 * The self-hosted entrypoint: one Node process serving the TanStack Start app, the
 * realtime WebSocket, the SMTP listener, the job queues and the backup
 * schedule, the same jobs worker.ts spreads across Cloudflare products.
 */
async function main() {
	const port = Number(process.env.PORT ?? 3000);
	const host = process.env.HOST ?? "0.0.0.0";

	const runtime = createNodeRuntime();
	const { env } = runtime;
	globalThis.__mailflareNodeEnv = env;

	const migrated = await applyMigrations(
		runtime.database,
		resolve(
			process.env.MIGRATIONS_DIR ?? join(process.cwd(), "drizzle", "migrations")
		)
	);
	if (migrated.length) {
		console.log(
			`Applied ${migrated.length} migration(s): ${migrated.join(", ")}`
		);
	}

	runtime.inboundQueue.setConsumer(async (body) => {
		if (isInboundQueueMessage(body)) {
			await processInboundMessage(env, body);
		}
	});
	runtime.outboundQueue.setConsumer(async (body) => {
		await (isWebhookRetryMessage(body)
			? processWebhookRetry(env, body as WebhookRetryMessage)
			: processOutboundQueue(env, body as OutboundQueueMessage));
	});
	runtime.agentQueue.setConsumer(async (body) => {
		if (
			typeof body === "object" &&
			body !== null &&
			(body as { kind?: unknown }).kind === "agent.draft" &&
			typeof (body as { jobId?: unknown }).jobId === "string"
		) {
			await processAgentDraftJob(env, (body as { jobId: string }).jobId);
		}
	});

	const dev = process.env.NODE_ENV !== "production";
	const server = createServer();
	let closeDevServer: (() => Promise<void>) | undefined;
	if (dev) {
		const { createServer: createViteServer } = await import("vite");
		const vite = await createViteServer({
			appType: "custom",
			server: { middlewareMode: true, ws: { server } },
		});
		server.on("request", vite.middlewares);
		closeDevServer = () => vite.close();
	} else {
		const { default: start } = await import(
			new URL("server/index.js", import.meta.url).href
		);
		const app = new Hono();
		app.use("*", async (context, proceed) => {
			await proceed();
			context.res = withSecurityHeaders(context.req.raw, context.res);
		});
		app.use("*", serveStatic({ root: "./dist/client" }));
		app.all("*", (context) => start.fetch(context.req.raw));
		server.on("request", getRequestListener(app.fetch));
	}

	const wss = new WebSocketServer({ noServer: true });
	server.on("upgrade", (request, socket, head) => {
		const { pathname } = parse(request.url ?? "/");
		if (pathname !== "/api/realtime") {
			if (!dev) {
				socket.destroy();
			}
			return;
		}
		const cookie = request.headers.cookie ?? "";
		const token = getSessionTokenFromRequest(
			new Request("http://localhost/", { headers: { cookie } })
		);
		void getUserFromSession(env, token).then((user) => {
			if (!user || user.disabled) {
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
				socket.destroy();
				return;
			}
			return wss.handleUpgrade(request, socket, head, (ws) =>
				runtime.realtime.attach(user.id, ws)
			);
		});
	});

	server.listen(port, host, () => {
		console.log(
			`Lab listening on http://${host}:${port} (data in ${runtime.dataDir})`
		);
	});

	const smtpPort = Number(process.env.SMTP_INBOUND_PORT ?? 25);
	if (smtpPort > 0) {
		startSmtpListener(env, runtime.mailer, {
			host: process.env.SMTP_INBOUND_HOST,
			hostname: process.env.MAIL_HOSTNAME,
			maxSize: Number(process.env.SMTP_MAX_SIZE ?? 36 * 1024 * 1024),
			port: smtpPort,
			tls:
				process.env.SMTP_TLS_KEY && process.env.SMTP_TLS_CERT
					? {
							certPath: process.env.SMTP_TLS_CERT,
							keyPath: process.env.SMTP_TLS_KEY,
						}
					: null,
		});
	}
	const stopScheduler = startScheduler(env);

	const shutdown = () => {
		stopScheduler();
		void closeDevServer?.();
		runtime.inboundQueue.stop();
		runtime.outboundQueue.stop();
		runtime.agentQueue.stop();
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 5000).unref();
	};
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

try {
	await main();
} catch (error) {
	console.error("Lab failed to start", error);
	process.exit(1);
}
