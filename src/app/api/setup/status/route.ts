import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";
import { getPrimaryDomain } from "@/lib/user";

export async function GET() {
	const env = getEnv();
	try {
		const [adminAccountExists, domain] = await Promise.all([
			hasAdminAccount(env),
			getPrimaryDomain(env),
		]);
		return Response.json(
			{
				hasAdminAccount: adminAccountExists,
				hasPrimaryDomain: !!domain,
				primaryDomain: domain
					? {
							hostname: domain.hostname,
							sendingRequested: domain.sendingRequested,
						}
					: null,
			},
			{
				headers: { "Cache-Control": "no-store" },
			}
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not load setup status";
		return Response.json({ error: message }, { status: 500 });
	}
}
