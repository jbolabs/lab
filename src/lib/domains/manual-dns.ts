import type { DomainDnsView } from "@/lib/domains/service";

/**
 * The DNS a self-hosted install needs when Mailflare is not managing the
 * zone. Rendered as "missing" until the operator confirms, since the app
 * cannot read their DNS; the records are what the SMTP listener and an
 * SMTP relay expect.
 */
export async function getManualDomainDns(
	env: CloudflareEnv,
	hostname: string
): Promise<DomainDnsView> {
	const mailHost = process.env.MAIL_HOSTNAME?.trim() || `mail.${hostname}`;
	const records = [
		{ content: `10 ${mailHost}`, name: hostname, ttl: 3600, type: "MX" },
		{
			content: `v=spf1 a:${mailHost} ~all`,
			name: hostname,
			ttl: 3600,
			type: "TXT",
		},
		{
			content: "v=DMARC1; p=none",
			name: `_dmarc.${hostname}`,
			ttl: 3600,
			type: "TXT",
		},
	];
	const mailer = env.EMAIL as unknown as { configured?: boolean };
	return await {
		routing: { missing: records, records: [], status: "manual" },
		sending: [],
		sendingEnabled: mailer?.configured === true,
	};
}
