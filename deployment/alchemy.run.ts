/**
 * Existing mail installation, now served at lab.jbolabs.com.
 * Keep stack mail, stage prod and every resource ID unchanged: same remote state.
 * Mailflare applies D1 migrations through its existing operator-controlled UI.
 * Build first; upload the Worker byte-for-byte with bundle:false.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Effect, Layer } from "effect";

import { sharedStateContext } from "./shared-state.ts";
import { accountId, mailDomains, mailflare } from "./config.ts";
import { publishesDmarc } from "./mail-domain-flags.ts";

const dist = (path: string) =>
  new URL(`../dist/${path}`, import.meta.url).pathname;

/** Queue consumer settings copied from Mailflare's `wrangler.jsonc`. */
const queues = [
  { batchSize: 5, binding: "INBOUND_QUEUE", id: "Inbound" },
  { batchSize: 5, binding: "OUTBOUND_QUEUE", id: "Outbound" },
  { batchSize: 1, binding: "AGENT_QUEUE", id: "Agent" },
] as const;

export default Alchemy.Stack(
  "mail",
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(Alchemy.Stage.pipe(Effect.flatMap((stage) => stage === "prod" ? Effect.succeed(Cloudflare.state().pipe(Layer.provide(sharedStateContext))) : Effect.die(new Error("Mailflare runtime only supports --stage prod"))))),
  },
  Effect.gen(function* mail() {
    const environment = yield* yield* Cloudflare.CloudflareEnvironment;
    if (environment.accountId !== accountId) return yield* Effect.die(new Error("Wrong Cloudflare account for the existing Mailflare installation"));

    // Mail and attachments: never let a destroy take them with it.
    const db = yield* Cloudflare.D1.Database("Database", {
      name: "mailflare",
    }).pipe(RemovalPolicy.retain());
    const bucket = yield* Cloudflare.R2.Bucket("Raw", {
      name: "mailflare-raw",
    }).pipe(RemovalPolicy.retain());

    const queueResources = [];
    for (const queue of queues) {
      queueResources.push({
        ...queue,
        resource: yield* Cloudflare.Queues.Queue(`${queue.id}Queue`, {
          name: `mailflare-${queue.id.toLowerCase()}`,
        }),
      });
    }

    // Each zone: routing on, catch-all to the Worker, Email Sending on the
    // apex (Mailflare sends as you@<domain>), and a DMARC policy.
    const zones = [];
    for (const domain of mailDomains) {
      const id = domain.name.replaceAll(".", "-");
      if (domain.ownsRouting) {
        // Retained: disabling routing would bounce every address on the zone.
        yield* Cloudflare.Email.Routing(`Routing-${id}`, {
          zone: domain.name,
        }).pipe(RemovalPolicy.retain());
      }
      yield* Cloudflare.Email.SendingSubdomain(`Sending-${id}`, {
        name: domain.name,
        zoneId: domain.zoneId,
      }).pipe(RemovalPolicy.retain());
      if (publishesDmarc(domain)) {
        yield* Cloudflare.DNS.Record(`Dmarc-${id}`, {
          // Monitor first; tighten to quarantine once reports show only Cloudflare sending.
          content: '"v=DMARC1; p=none; adkim=r; aspf=r"',
          name: `_dmarc.${domain.name}`,
          ttl: 1,
          type: "TXT",
          zoneId: domain.zoneId,
        });
      }
      zones.push({ ...domain, id });
    }

    // Mailflare's runtime Cloudflare token: its domain onboarding checks and
    // repairs routing, DNS and sending on these zones (the same settings this
    // stack declares, so its writes are no-ops). Scoped to just these zones.
    const zoneScope = Object.fromEntries(
      zones.map((zone) => [
        `com.cloudflare.api.account.zone.${zone.zoneId}`,
        "*",
      ])
    );
    const cfToken = yield* Cloudflare.ApiToken.AccountApiToken("RuntimeToken", {
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
          resources: { [`com.cloudflare.api.account.${accountId}`]: zoneScope },
        },
        {
          effect: "allow",
          permissionGroups: ["Email Sending Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        },
      ],
    });

    const worker = yield* Cloudflare.Worker("Mailflare", {
      assets: { directory: dist("client"), notFoundHandling: "none" },
      bundle: false,
      compatibility: {
        date: "2026-05-20",
        flags: ["nodejs_compat", "global_fetch_strictly_public"],
      },
      crons: ["0 2 * * *", "*/5 * * * *"],
      domain: mailflare.host,
      env: {
        ...Object.fromEntries(
          queueResources.map((q) => [q.binding, q.resource])
        ),
        AGENT_RATE_LIMIT: Cloudflare.RateLimit("AGENT_RATE_LIMIT", {
          namespaceId: 1002,
          simple: { limit: 120, period: 60 },
        }),
        AI: Cloudflare.Workers.AI("AI"),
        APP_URL: `https://${mailflare.host}`,
        BUCKET: bucket,
        CF_EMAIL_WORKER_NAME: mailflare.workerName,
        CF_TOKEN: cfToken.value,
        DB: db,
        DEVICE_LOGIN_RATE_LIMIT: Cloudflare.RateLimit(
          "DEVICE_LOGIN_RATE_LIMIT",
          {
            namespaceId: 1003,
            simple: { limit: 10, period: 60 },
          }
        ),
        EMAIL: Cloudflare.Email.SendEmail("EMAIL"),
        IMAGES: Cloudflare.Images.Images("IMAGES"),
        LOGIN_RATE_LIMIT: Cloudflare.RateLimit("LOGIN_RATE_LIMIT", {
          namespaceId: 1001,
          simple: { limit: 20, period: 60 },
        }),
        REALTIME: Cloudflare.DurableObject("REALTIME", {
          className: "RealtimeHub",
        }),
        WORKER_SELF_REFERENCE: Cloudflare.Workers.Self,
      },
      main: dist("server/index.js"),
      name: mailflare.workerName,
      observability: { enabled: true },
    });

    for (const queue of queueResources) {
      yield* Cloudflare.Queues.Consumer(`${queue.id}Consumer`, {
        queueId: queue.resource.queueId,
        scriptName: worker.workerName,
        settings: { batchSize: queue.batchSize, maxRetries: 3 },
      });
    }

    for (const zone of zones) {
      yield* Cloudflare.Email.CatchAll(`CatchAll-${zone.id}`, {
        actions: [{ type: "worker", value: [worker.workerName] }],
        name: `Route all email to ${mailflare.workerName}`,
        zone: zone.zoneId,
      });
    }

    return { url: `https://${mailflare.host}` };
  })
);
