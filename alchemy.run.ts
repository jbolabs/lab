/**
 * Lab on Cloudflare: one Worker built from this Vite app, its storage and
 * queues, and, in `prod`, the mail domains it serves.
 *
 * Stages:
 * - `prod` is the live install at lab.jbolabs.com. It keeps the stack name,
 *   logical IDs and physical names it has always had, so nothing is replaced.
 * - `pr-<n>` is a preview of a labelled pull request (workers.dev, fresh
 *   database, no mail domains), destroyed when the PR closes.
 * - `dev_<user>` is `npm run dev`: every binding runs locally.
 */
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as GitHub from "@alchemy.run/github";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
	accountId,
	accountResource,
	host,
	mailDomains,
	mailZoneResources,
	workerName,
} from "./stacks/config.ts";
import { settings } from "./stacks/settings.ts";
import { vapidPrivateKey, vapidPublicKey } from "./stacks/web-push.ts";

/** The pull request a preview deploy comes from; set by .github/workflows/lab.yml. */
const pullRequest = process.env.PULL_REQUEST;

/** Each queue the Worker produces to and consumes. */
const queues = {
	AGENT_QUEUE: { batchSize: 1, id: "Agent" },
	INBOUND_QUEUE: { batchSize: 5, id: "Inbound" },
	OUTBOUND_QUEUE: { batchSize: 5, id: "Outbound" },
} as const;

type QueueBinding = keyof typeof queues;

/**
 * Everything the Worker is bound to. A function of the stage's resources so
 * `LabEnv` (and through it the app's `CloudflareEnv`) is derived from the
 * same object that is deployed.
 */
const bindings = (resources: {
	bucket: Cloudflare.R2.Bucket;
	db: Cloudflare.D1.Database;
	pushKeys: Alchemy.KeyPair;
	queues: Record<QueueBinding, Cloudflare.Queues.Queue>;
}) => ({
	...resources.queues,
	AGENT_RATE_LIMIT: Cloudflare.RateLimit("AGENT_RATE_LIMIT", {
		namespaceId: 1002,
		simple: { limit: 120, period: 60 },
	}),
	AI: Cloudflare.Workers.AI("AI"),
	BUCKET: resources.bucket,
	DB: resources.db,
	DEVICE_LOGIN_RATE_LIMIT: Cloudflare.RateLimit("DEVICE_LOGIN_RATE_LIMIT", {
		namespaceId: 1003,
		simple: { limit: 10, period: 60 },
	}),
	EMAIL: Cloudflare.Email.SendEmail("EMAIL"),
	IMAGES: Cloudflare.Images.Images("IMAGES"),
	LOGIN_RATE_LIMIT: Cloudflare.RateLimit("LOGIN_RATE_LIMIT", {
		namespaceId: 1001,
		simple: { limit: 20, period: 60 },
	}),
	REALTIME: Cloudflare.DurableObject("REALTIME", { className: "RealtimeHub" }),
	// oxlint-disable-next-line unicorn/no-array-method-this-argument -- Output.map(value, mapper), not Array#map.
	VAPID_PRIVATE_KEY: Output.map(resources.pushKeys.privateKey, vapidPrivateKey),
	// oxlint-disable-next-line unicorn/no-array-method-this-argument -- Output.map(value, mapper), not Array#map.
	VAPID_PUBLIC_KEY: Output.map(resources.pushKeys.publicKey, vapidPublicKey),
	WORKER_SELF_REFERENCE: Cloudflare.Workers.Self,
});

/** The Worker's bindings as the app sees them; `env.d.ts` builds `CloudflareEnv` from it. */
export type LabEnv = Cloudflare.InferEnv<ReturnType<typeof bindings>>;

/**
 * Prod-only settings: the public origin and the app's own Cloudflare token,
 * which domain onboarding uses to check and repair routing, DNS and sending on
 * the mail zones (the same settings this stack declares, so its writes are
 * no-ops). Other stages run without one and record domains as manual.
 */
const mailEnv = Effect.fn(function* mailEnv() {
	const token = yield* Cloudflare.ApiToken.AccountApiToken("RuntimeToken", {
		accountId,
		name: "mailflare-runtime",
		policies: [
			{
				effect: "allow",
				permissionGroups: [
					"Zone Read",
					"Zone Settings Write",
					"DNS Write",
					"Email Routing Rules Write",
				],
				resources: { [accountResource]: mailZoneResources },
			},
			{
				effect: "allow",
				permissionGroups: ["Email Sending Write"],
				resources: { [accountResource]: "*" },
			},
		],
	});
	return {
		APP_URL: `https://${host}`,
		CF_EMAIL_WORKER_NAME: workerName,
		CF_TOKEN: token.value,
		VAPID_SUBJECT: `https://${host}`,
	};
});

/**
 * Each mail zone: routing on (where Lab owns it), sending on the apex so Lab
 * sends as you@<domain>, a DMARC policy, and every address to the Worker.
 */
const mailDomainsTo = Effect.fn(function* mailDomainsTo(
	worker: Alchemy.Input<string>
) {
	for (const domain of mailDomains) {
		const id = domain.name.replaceAll(".", "-");
		if (domain.ownsRouting) {
			// Disabling routing would bounce every address on the zone.
			yield* Cloudflare.Email.Routing(`Routing-${id}`, {
				zone: domain.name,
			}).pipe(Alchemy.RemovalPolicy.retain());
		}
		yield* Cloudflare.Email.SendingSubdomain(`Sending-${id}`, {
			name: domain.name,
			zoneId: domain.zoneId,
		}).pipe(Alchemy.RemovalPolicy.retain());
		if (domain.ownsDmarc) {
			yield* Cloudflare.DNS.Record(`Dmarc-${id}`, {
				// Monitor first; tighten to quarantine once reports show only Cloudflare sending.
				content: '"v=DMARC1; p=none; adkim=r; aspf=r"',
				name: `_dmarc.${domain.name}`,
				ttl: 1,
				type: "TXT",
				zoneId: domain.zoneId,
			});
		}
		yield* Cloudflare.Email.CatchAll(`CatchAll-${id}`, {
			actions: [{ type: "worker", value: [worker] }],
			name: `Route all email to ${workerName}`,
			zone: domain.zoneId,
		});
	}
});

/** The stack program: every resource, for whichever stage and state store run it. */
export const Lab = Effect.gen(function* lab() {
	const prod = (yield* Alchemy.Stage) === "prod";
	if (prod) {
		const environment = yield* yield* Cloudflare.CloudflareEnvironment;
		if (environment.accountId !== accountId) {
			return yield* Effect.die(
				new Error(`prod deploys only to Cloudflare account ${accountId}`)
			);
		}
	}
	// Prod keeps the physical names it was created with; other stages get generated ones.
	const named = (name: string) => (prod ? { name } : {});
	// Stored mail outlives any destroy of prod.
	const keepInProd = Alchemy.RemovalPolicy.retain(prod);

	const db = yield* Cloudflare.D1.Database("Database", {
		...named("mailflare"),
		migrations: "./drizzle/migrations",
	}).pipe(keepInProd);
	const bucket = yield* Cloudflare.R2.Bucket(
		"Raw",
		named("mailflare-raw")
	).pipe(keepInProd);
	const queueResources = {} as Record<QueueBinding, Cloudflare.Queues.Queue>;
	for (const [binding, queue] of Object.entries(queues)) {
		queueResources[binding as QueueBinding] = yield* Cloudflare.Queues.Queue(
			`${queue.id}Queue`,
			named(`mailflare-${queue.id.toLowerCase()}`)
		);
	}
	// Rotating this pair would invalidate every browser's push subscription.
	const pushKeys = yield* Alchemy.KeyPair("WebPushKeys", {
		algorithm: "ec",
		namedCurve: "P-256",
	}).pipe(keepInProd);

	const worker = yield* Cloudflare.Website.Vite("Mailflare", {
		...named(workerName),
		assets: { notFoundHandling: "none" },
		compatibility: {
			date: "2026-05-20",
			flags: ["nodejs_compat", "global_fetch_strictly_public"],
		},
		crons: ["0 2 * * *", "*/5 * * * *"],
		// Falls back to the next free port, so worktrees can run side by side.
		dev: {
			port: yield* Config.Number("PORT").pipe(Config.withDefault(3000)),
		},
		env: {
			...(yield* settings()),
			...bindings({ bucket, db, pushKeys, queues: queueResources }),
			...(prod ? yield* mailEnv() : {}),
		},
		main: "worker.ts",
		observability: { enabled: true },
		...(prod ? { domain: host } : {}),
	});

	for (const [binding, queue] of Object.entries(queues)) {
		yield* Cloudflare.Queues.Consumer(`${queue.id}Consumer`, {
			queueId: queueResources[binding as QueueBinding].queueId,
			scriptName: worker.workerName,
			settings: { batchSize: queue.batchSize, maxRetries: 3 },
		});
	}
	if (prod) {
		yield* mailDomainsTo(worker.workerName);
	}
	// One comment per PR, updated on every push.
	if (pullRequest) {
		yield* GitHub.Comment("PreviewComment", {
			body: Output.interpolate`Preview: ${worker.url}\n\nBuilt from ${process.env.COMMIT_SHA?.slice(0, 7) ?? "a local checkout"}. Destroyed when this PR closes or loses the \`preview\` label.`,
			issueNumber: Number(pullRequest),
			owner: "jbolabs",
			repository: "lab",
		});
	}

	return { url: prod ? `https://${host}` : worker.url };
});

export default Alchemy.Stack(
	"mail",
	{
		// GitHub is only needed for the preview comment.
		providers: pullRequest
			? Layer.mergeAll(Cloudflare.providers(), GitHub.providers())
			: Cloudflare.providers(),
		// Pinned so a login to another account can never read or write this stack's state.
		state: Cloudflare.state({ accountId }),
	},
	Lab
);
