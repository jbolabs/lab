import { hasCloudflareCredentials, isNodeRuntime } from "@/lib/runtime";

import type { SetupRequirementCheck } from "./types";

export function getSetupRequirementChecks(
	env: CloudflareEnv
): SetupRequirementCheck[] {
	const hasApiToken = !!env.CF_TOKEN?.trim();
	const hasGlobalKey = !!env.CF_API_KEY?.trim() && !!env.CF_EMAIL?.trim();

	if (isNodeRuntime(env)) {
		const mailer = env.EMAIL as unknown as { configured?: boolean };
		return [
			{
				configured: !!env.DB,
				key: "Database",
				message:
					"DATA_DIR must be writable; the SQLite database is created there on start.",
			},
			{
				configured: mailer?.configured === true,
				key: "Outbound mail",
				message:
					"Set SMTP_URL, or CF_ACCOUNT_ID with CF_TOKEN to send through Cloudflare. Receiving works without it.",
			},
			{
				configured: true,
				key: "Cloudflare API credentials (optional)",
				message: hasCloudflareCredentials(env)
					? "Domains are provisioned on Cloudflare automatically."
					: "Not set: add MX and SPF records for each domain by hand, as shown on the domain page.",
			},
		];
	}

	return [
		{
			configured: hasApiToken || hasGlobalKey,
			key: "Cloudflare API credentials",
			message: "Set CF_TOKEN, or set both CF_API_KEY and CF_EMAIL.",
		},
		{
			configured: !!env.DB,
			key: "D1 database",
			message: "Deploy the Worker with the DB binding from wrangler.jsonc.",
		},
	];
}
