/** The Cloudflare account every Lab stage deploys to. */
export const accountId = "984b82870acd18daf8bda97bad966b38";

/** Where prod serves the web app. Not `mail.`: that is the studio sites' sending subdomain. */
export const host = "lab.jbolabs.com";

/**
 * Prod's Worker script name. Persisted identifiers keep the upstream
 * `mailflare` name (see docs/jbo-deployment.md), and the app points each
 * zone's catch-all at the script named by `CF_EMAIL_WORKER_NAME`.
 */
export const workerName = "mailflare";

/** One zone whose mail lands in Lab. */
export interface MailDomain {
	readonly name: string;
	/** Publish `_dmarc`. False where the zone already has a policy: a second record makes DMARC invalid. */
	readonly ownsDmarc: boolean;
	/** Enable Email Routing. False where another stack owns it; Lab then only claims the catch-all. */
	readonly ownsRouting: boolean;
	/** Pinned so the runtime token's scope is known at plan time. */
	readonly zoneId: string;
}

/**
 * Zones whose mail lands in Lab. The zones themselves belong to other repos:
 * jbolabs.com to jbolabs/jbolabs (which also owns its routing), pcobooster.com
 * and shouldertap.app to their own repos.
 *
 * Literal routing rules beat the catch-all, so addresses other stacks route
 * explicitly keep their handling: `support@shouldertap.app` stays with the
 * shouldertap repo's Support worker. shouldertap.app's `p=reject` DMARC
 * record predates Lab.
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

/** Account-scoped resource key for Cloudflare token policies. */
export const accountResource = `com.cloudflare.api.account.${accountId}`;

/** Token policy resources covering exactly the mail zones. */
export const mailZoneResources = Object.fromEntries(
	mailDomains.map((domain) => [
		`com.cloudflare.api.account.zone.${domain.zoneId}`,
		"*",
	])
);
