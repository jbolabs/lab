# MCP OAuth

Connect a remote MCP client to `https://your-mailflare-domain/mcp` and select OAuth. Sign in to Mailflare, review the application name and callback host, select permissions and mailboxes, and choose **Allow access**. Mailflare API keys continue to work.

OAuth uses Mailflare's existing password/MFA session for browser sign-in; no third-party identity provider or client secret is needed. Public clients register through `/oauth/register`. Client ID Metadata Documents and confidential clients are not implemented. Request mail/calendar permissions or admin permissions in separate connections. Admin permissions require an administrator and retain each tool's existing license/authorization checks.

New connections are offered email permissions and `offline_access` by default, without calendar or admin permissions. Calendar scopes must be explicitly requested and approved; only approved calendar tools are exposed. The consent screen still lets you decline permissions. Explicitly requested scopes remain unchanged. Older read-only connections must be reconnected to approve additional permissions; existing grants are never expanded.

Access tokens last 15 minutes. Request and approve `offline_access` to receive a rotating refresh token; the connection expires 30 days after approval even if refreshed. Without that permission, no refresh token is issued. Disconnect in **Settings → API keys → Connected apps** to revoke all tokens and cancel pending send reviews for the connection. Revocation also occurs when a refresh token is reused. Concurrent refreshes are treated as reuse; clients must serialize refreshes and reconnect if the result is lost.

The `mcp:send` permission allows `send_draft` to send an agent-created draft directly (or queue its requested send time) without browser review. It is offered explicitly at consent and can be declined. The tool requires the current draft revision and uses a stable delivery claim so retries do not send twice. Connections without this permission must use `request_send` and browser confirmation. OAuth grants cannot call the send-approval REST endpoint or authorize arbitrary REST/JMAP calls. Calendar write scopes retain the existing calendar mutation behavior.

## Deployment

Set `APP_URL` to the public HTTPS origin (for example `https://inbox.example.com`). Keep the incoming Host header equal to that origin's host; a reverse proxy may terminate TLS, but must preserve the public host. OAuth metadata and resource validation use this configured origin. HTTP is accepted only for local loopback development.

Apply migration `0067_add_mcp_oauth.sql` with the installation's normal migration/deployment workflow. There are no additional Cloudflare bindings, external services or signing secrets. Storage uses the same D1/SQLite database on Cloudflare and Node.

Durable client registrations and grant metadata are included in account backups. Pending consent requests, authorization codes, token hashes and rate counters are internal, short-lived records and are excluded. Restoring a backup requires reconnecting OAuth clients. Backups made before this migration remain restorable; restoring OAuth data into a database without the migration fails before deleting data.

## Protocol

- `/.well-known/oauth-protected-resource/mcp` (also available at the root metadata URL)
- `/.well-known/oauth-authorization-server`
- `/oauth/register`: RFC 7591 public-client registration, `token_endpoint_auth_method: none`; HTTPS or loopback callbacks only
- `/oauth/authorize`: authorization code flow, exact registered callback, required `resource`, mandatory PKCE `S256`
- `/oauth/token`: form-encoded code/refresh exchanges; include `client_id` and `resource`
- `/oauth/revoke`: form-encoded `client_id` and `token`; unknown/revoked tokens return success

The resource identifier is the exact public MCP URL, including `/mcp`. Supported mail permissions are `mcp:read`, `mcp:draft`, `mcp:organize`, `mcp:request-send`, `mcp:send`, `mcp:calendar-read`, and `mcp:calendar-write`. Admin permissions are `domains`, `accounts`, `mailboxes`, and `storage`. `offline_access` is optional and explicitly selectable at consent. Clients should preserve state and validate the authorization response issuer.

Tokens and codes are random and stored only as SHA-256 hashes. Grant identities reuse existing scoped MCP key records for send-review ownership; their random underlying API-key secret is discarded and never returned to the OAuth client. Mailbox membership, disabled users, and administrator roles are checked on MCP access. Public protocol endpoints have database-backed rate limits; Node uses a shared budget rather than trusting client-supplied proxy IP headers. New consent/registration requests clean up expired credentials.

## Validation

Run `npm run db:bundle`, `node --test tests/mcp-oauth.test.mjs tests/backup-table-list.test.mjs`, and `npx tsc --noEmit`. Exercise a real client against a deployed HTTPS origin before claiming compatibility with that client. Local protocol and browser tests do not prove an external client's connection behavior.

New OAuth strings currently use English fallbacks in the other locale catalogs.
