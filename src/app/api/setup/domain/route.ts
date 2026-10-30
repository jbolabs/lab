import { hasAdminAccount } from "@/lib/auth/setup";
import { getEnv } from "@/lib/cloudflare";
import { preflightDomain } from "@/lib/domains/preflight";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { getPrimaryDomain } from "@/lib/user";
import { setupDomainSchema } from "@/lib/validators";

export async function POST(request: Request) {
	const env = getEnv();
	if (await hasAdminAccount(env)) {
		return Response.json(
			{ error: "Initial setup is already complete" },
			{ status: 403 }
		);
	}

	const existing = await getPrimaryDomain(env);
	if (existing) {
		return Response.json(
			{ error: "Primary domain already exists" },
			{ status: 409 }
		);
	}

	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return Response.json({ error: "Invalid setup request" }, { status });
	}
	const parsed = setupDomainSchema.safeParse(body);
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
