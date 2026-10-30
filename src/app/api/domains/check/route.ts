import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { preflightDomain } from "@/lib/domains/preflight";
import { setupDomainSchema } from "@/lib/validators";

export async function POST(request: Request) {
	const env = getEnv();
	await requireUser(env, request);
	const parsed = setupDomainSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	try {
		return Response.json({
			domain: await preflightDomain(env, parsed.data.hostname),
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Domain check failed";
		return Response.json({ error: message }, { status: 502 });
	}
}
