# Lab deployment

Lab is one Alchemy stack, `alchemy.run.ts`, with its config, optional settings and CI stack in `stacks/`. It owns the Worker, D1, R2, queues, the realtime Durable Object, the runtime API token and Lab's mail routing and sending on its zones. Shared studio infrastructure (registrar, zones, `mail.jbolabs.com` site sending, jbolabs.com routing enablement) stays in `jbolabs/jbolabs`.

## Stages

| Stage | What it is | Deployed by |
| --- | --- | --- |
| `prod` | lab.jbolabs.com and the mail domains | CI, on every push to `main` |
| `pr-<n>` | A preview on workers.dev with a fresh database and no mail domains | CI, when PR `n` has the `preview` label; destroyed when it closes or loses the label |
| `dev_<user>_<worktree>` | `npm run dev`, every binding local | You |
| `live_<user>_<worktree>` | `npm run deploy`, your own cloud sandbox | You |

Prod keeps the stack name `mail`, every logical ID and every physical name (`mailflare`, `mailflare-raw`, `mailflare-inbound`…) it was created with. Its database, bucket, Web Push keys, routing and sending subdomains are retained: a destroy leaves them in place. Never rename them, and never use Wrangler or raw API writes against them.

## Deploying prod

Merging to `main` runs `.github/workflows/lab.yml`: lint, formatting, types, tests and the Node build, then `alchemy deploy --stage prod` in the `production` environment and a smoke request to `/api/setup/status`. Run `npx alchemy plan --stage prod --profile admin` beforehand to read the plan for a risky change. Deploying prod from a laptop needs explicit operator authorization.

Rollback is a reviewed revert merged to `main`. Never `destroy` prod or restore an older database to roll back: that can discard delivered mail.

## Migrations

Migrations are the SQL files in `drizzle/migrations/`. Every deploy (and every `npm run dev`) applies pending ones before the new Worker goes live, recorded in `__alchemy_migrations`. Prod's first deploy on Alchemy beta.85 adopts the old `d1_migrations` history one way; that table is then frozen. Migrations must stay additive: the old Worker serves until the new one is up.

## Optional settings

`stacks/settings.ts` lists the settings the Worker can be deployed with (Turnstile, AI provider, APNs, Resend/SES, B2/S3). Each is bound only when set: from `.env` locally (see `.env.example`), and from the `production` environment's secrets in CI. To add one, add it to `stacks/settings.ts`, `.env.example` and the `production` job's `env` in `lab.yml`; `tests/stack-settings.test.mjs` fails until all three agree.

## CI stack

`stacks/github.ts` (stack `mailflare-ci`, stage `ci`) creates the `production` environment (main only) with its deploy token, the `preview` environment with a token that cannot touch the mail zones, and the `preview` label. Apply it from a trusted machine with the admin profile:

```sh
npm run ci:plan
npm run ci:deploy
```

Both tokens expire on the date in that file. Rotate them before then by bumping `generation` and running `ci:deploy`. Applying this stack needs explicit operator authorization.

## State store

Every repo on the account shares one Cloudflare state store. Alchemy beta.85 upgrades it to v8, one way. After that, never run an older Alchemy against it from any repo or CI job: it can lose the store's encryption key, which nothing recovers. Upgrade every repo on the account to beta.85 or later before it deploys again.

## Lab rename

The repository is `jbolabs/lab`; the app is Lab and the primary URL is `https://lab.jbolabs.com`. This is a hard hostname cutover: sign in, reconnect MCP/OAuth clients, and reinstall any PWA at the new origin. Old links and provider webhooks pointing to `inbox.jbolabs.com` must be updated; no compatibility hostname or OAuth alias remains. Existing OAuth grants stay in the database but are resource-bound to the old origin and cannot authenticate at the new one.

Do not mechanically replace `mailflare` in physical resource names, Alchemy `mail` / `prod`, logical resource IDs, cookies/storage keys, backup format identifiers, calendar event UIDs, or email loop-prevention headers. These are persisted identifiers, not display branding. D1, R2, queues, the realtime namespace, API keys and stored records are reused in place. No database migration or data move is part of the rename. The CI stack retains its `mailflare-ci` / `ci` identity; GitHub resources follow the same repository ID after its rename.

Rollback uses a reviewed revert deployed through the same stack. Never destroy/recreate the stack or restore an older database for a branding rollback; that could discard newly delivered mail. Upstream Mailflare attribution and AGPL licensing remain in this repository.

## iPhone web app notifications

`alchemy.run.ts` declares a `WebPushKeys` P-256 key pair, retained in prod. Alchemy keeps it in state across releases, converts the public key to Web Push format, and binds the private key as a Worker secret. `VAPID_SUBJECT` is the installation HTTPS origin. No extra CI secret or raw Cloudflare write is needed. Do not replace or rename this resource: that would invalidate browser subscriptions.

On iPhone, add the Lab to the Home Screen from Safari's Share menu, open that icon, and enable **Settings → Inbox → Notifications → New email notifications**. Permission is requested only from that switch. Existing opt-ins refresh on app launch, resume, reconnect and account changes. Turning the switch off prevents automatic renewal. Each received push displays an alert even when the app is open, as Safari requires.

After a deploy that touches push, verify the authenticated `/api/push/config` reports `enabled: true` without exposing private keys. On a physical iPhone, enable notifications, lock the phone with the app closed, and deliver a controlled non-spam email. Confirm the alert, unread badge, and tap-through to the message; repeat with the app open, after relaunch, and after toggling off (no alerts). Also verify blocked permission and the Safari-tab installation guidance. Local tests do not establish physical-device delivery or delivery latency.

## Framework runtime

TanStack Start handles page rendering, nested layouts, server functions and HTTP routes. `worker.ts` retains the existing mail, queue, cron and RealtimeHub entrypoints and delegates ordinary HTTP to `src/server.ts`. The Node build uses that same HTTP handler with the existing SQLite, SMTP and scheduler runtime. Alchemy builds the Worker with Vite on deploy and in `npm run dev`; `npm run build:node`, `npm run typecheck` and `npm test` run locally without cloud credentials. Source components remain under `src/app`, but routing is explicit in `src/routes` and generated into `src/routeTree.gen.ts` by the Start plugin. Public `NEXT_PUBLIC_TURNSTILE_SITE_KEY` remains a supported build input for installation compatibility. Fonts are bundled locally.
