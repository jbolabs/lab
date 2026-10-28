/** Public installation identifiers copied without changes from the former owner. */
export const accountId = "984b82870acd18daf8bda97bad966b38";

/** One zone onboarded to Mailflare; flags are required so deploys never assume uniform DNS. */
export interface MailDomain {
  readonly name: string;
  readonly ownsDmarc: boolean;
  readonly ownsRouting: boolean;
  readonly zoneId: string;
}

export const mailflare = {
  /** Where the web UI is served. Not `mail.`: that is the sites' sending subdomain. */
  host: "inbox.jbolabs.com",
  /**
   * Mailflare hardcodes this script name when it points a zone's catch-all at
   * the Worker (`getEmailWorkerName()` in `src/lib/cloudflare-api-utils.ts`),
   * so the Worker must be deployed under exactly this name.
   */
  workerName: "mailflare",
} as const;

/**
 * Zones whose mail lands in Mailflare. Zone ids are pinned so the runtime
 * token's scope is known at plan time (zones are owned by the studio stack in jbolabs/jbolabs, the
 * pcobooster repo and the shouldertap repo respectively).
 *
 * `ownsDmarc`: whether `deployment/alchemy.run.ts` publishes the zone's `_dmarc` record.
 * shouldertap.app already has one (`p=reject`, set outside Alchemy before
 * Mailflare), and a second record would make DMARC invalid for the domain.
 *
 * `ownsRouting`: whether `deployment/alchemy.run.ts` enables Email Routing on the zone.
 * jbolabs.com's routing belongs to `jbolabs/jbolabs:stacks/studio.ts`, so mail only claims its
 * catch-all.
 *
 * Literal routing rules beat the catch-all, so addresses other stacks route
 * explicitly keep their own handling: `support@shouldertap.app` stays with the
 * shouldertap repo's Support worker (it forwards to Gmail and Slack).
 */
export const mailDomains = [
  {
    name: "jbolabs.com",
    ownsDmarc: true,
    ownsRouting: false,
    zoneId: "333c7cb3be883e897fae5012d82f7091",
  },
  {
    name: "pcobooster.com",
    ownsDmarc: true,
    ownsRouting: true,
    zoneId: "a43fafd2bb6e6fb47f0233e6168e622e",
  },
  {
    name: "shouldertap.app",
    ownsDmarc: false,
    ownsRouting: true,
    zoneId: "67ca54dc8d4b36bf46486ad14875914d",
  },
] as const satisfies readonly MailDomain[];
