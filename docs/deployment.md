> JBO operators: prod (`lab.jbolabs.com`) is deployed by CI; see [jbo-deployment.md](jbo-deployment.md). Node self-hosting is in [self-hosting.md](self-hosting.md).

# Deployment and configuration

Lab deploys to Cloudflare with [Alchemy](https://alchemy.run). `alchemy.run.ts` declares the Worker and everything it is bound to: D1, R2, the inbound, outbound and agent queues, the realtime Durable Object, rate limits, Workers AI, Images, Email Sending and the cron triggers. There is no Wrangler config.

## Deploy

```bash
npm install
npx alchemy profile edit    # once: connect your Cloudflare account
npm run deploy              # stage live_<user>_<worktree>
```

Each deploy builds the app with Vite, applies pending migrations from `drizzle/migrations`, then uploads the Worker. The complete Worker is required because `worker.ts` also handles inbound email, queues, scheduled jobs and the realtime Durable Object. Web Push keys are generated once per stage and kept in Alchemy state, so browser subscriptions survive redeploys.

## Settings

Optional settings are listed in `stacks/settings.ts` and documented in `.env.example`: Turnstile, the AI provider, APNs for the mobile apps, Resend and SES credentials, and B2 or S3 storage. Put them in `.env` (or the shell environment) before `npm run deploy` or `npm run dev`; each is bound only when set, secrets as Worker secrets. Settings entered in the app (for example provider credentials under **Admin → Domains**) take precedence.

## Cloudflare API token

In prod the stack mints the app's own `CF_TOKEN`, scoped to the mail zones (`alchemy.run.ts`), so Lab configures Email Routing, sending and DNS itself. Other stages run without one: the domain page lists the DNS records to add by hand. Email Sending needs a paid Workers plan and each domain on-boarded under **Compute → Email Service → Email Sending**.

## Finish setup

1. Open the deployed URL.
2. Go to `/setup` if Mailflare does not take you there automatically.
3. Create the first admin account when prompted. The database is already migrated by the deploy.

## Connect a domain

1. Enter a domain. In prod, Lab enables Email Routing and configures routing and sending DNS; elsewhere it lists the records to add.
2. Add the records if asked.
3. Choose the address for your first mailbox and finish setup.
4. Open the inbox and send a test message to the new address.

To connect more domains later, open **Admin → Domains**, select **New domain**, enter the hostname and choose the receiving service. With Cloudflare, Mailflare configures Email Routing and Email Sending automatically. With Resend or Amazon SES, add the provider's credentials and run its setup from the domain page; see [Sending and receiving providers](providers.md).

Resend and SES receive mail by calling your app, so they need the app's public HTTPS address (`APP_URL`, set by the stack in prod).

## Object storage (R2, Backblaze B2 or AWS S3)

Raw mail, attachments, Drive files, avatars, branding icons, JMAP uploads and backups all live in one bucket. By default that is the `BUCKET` R2 binding in `alchemy.run.ts`. To use Backblaze B2 instead, set four [settings](#settings):

| Variable | Example | Purpose |
| --- | --- | --- |
| `B2_KEY_ID` | `004abc...` | Application key ID |
| `B2_APPLICATION_KEY` | `K004...` | Application key secret |
| `B2_BUCKET` | `mailflare` | Bucket name |
| `B2_ENDPOINT` | `s3.us-west-004.backblazeb2.com` | S3-compatible endpoint from the bucket page; the region is read from it |

To use AWS S3 instead, set `S3_BUCKET`, `S3_REGION` and credentials: `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, which fall back to `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` so one IAM user can serve SES and storage. The bucket must be private and in the named region; the IAM user needs `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` and `s3:AbortMultipartUpload` on `arn:aws:s3:::<bucket>/*`. If both are configured, B2 wins.

When all four B2 variables (or the S3 ones) are present that storage replaces R2 everywhere; with any missing, R2 stays in use (a partial setup is reported by `GET /api/v1/storage`). The R2 bucket stays bound and is simply unused. Use a bucket-restricted application key with read and write access, and keep the bucket private. Notes:

- **Switching does not copy data.** Objects already in R2 are not moved; copy them to the bucket first (for example with `rclone`, keeping the same keys) or old mail bodies, attachments and Drive files will report as missing.
- **Drive upload parts** are buffered one at a time in the Worker (64 MB each). B2 and S3 require every part but the last to be at least 5 MB, which holds.
- **Lifecycle.** Set the bucket's lifecycle rule to keep only the last version and to delete unfinished large files after a few days, as R2 would abort incomplete multipart uploads.
- **Test it** with `POST /api/v1/storage` (admin key with the `storage` scope), or the `manage_storage` MCP tool with `action: "test"`; it writes, reads and deletes a small object.

## Database backups

Mailflare exports its D1 records as JSON and stores the backup files in the configured storage bucket (R2, or Backblaze B2 when configured). A cron trigger declared in `alchemy.run.ts` runs daily at 02:00 UTC and applies the schedule selected under **Admin → Backups**. Manual backups run the same record export directly from the admin API.

## Email assistant and MCP

The assistant uses the Workers AI `AI` binding and the agent queue, both declared in `alchemy.run.ts`. Set `AI_MODEL`, or `AI_BASE_URL` and `AI_API_KEY` for an OpenAI-compatible API, to change the model. The five-minute cron recovers pending auto-draft work; the 02:00 UTC cron still runs backups.

In the inbox, open **Assistant → Settings** for a mailbox, select its reviewer, and enable the assistant. Auto-drafting is a separate opt-in. It skips spam, automated mail, and mailboxes with out-of-office replies enabled. Generated replies appear as ordinary drafts assigned to the reviewer. The reviewer must open the draft and confirm the exact content before delivery.

The assistant panel no longer exposes MCP key management. External MCP clients can still connect to `https://<your-mailflare-origin>/mcp` with a mailbox-scoped Bearer key created through the authenticated `/api/agent/mcp-keys` endpoint. Keys can be listed and revoked through that endpoint; a new key is shown only once. The server uses Streamable HTTP and accepts clients that can set a Bearer header. Its `request_send` tool returns a Mailflare review URL; the MCP key cannot confirm or deliver messages directly. MCP does not require Workers AI for read and draft tools.

## Updating

Merge to `main`. CI deploys prod, migrations included; there is nothing to apply by hand. Keep migrations additive (new tables and columns, old ones kept for a release), because the previous Worker serves briefly against the new schema. Never edit a merged migration: add a new uniquely named SQL file to `drizzle/migrations`.

## Features

Lab has no license system: multiple accounts, shared inboxes and booking hosts, custom branding (**Admin → Branding**) and account forwarding are always available. The `license_settings` table from upstream Mailflare is no longer read.
