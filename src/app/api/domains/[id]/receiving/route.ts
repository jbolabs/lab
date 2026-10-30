import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { canManageDomains } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { receivingPresence, removeReceiving } from "@/lib/domains/receiving";
import { getDomainForUser } from "@/lib/domains/service";

interface Params {
	params: Promise<{ id: string }>;
}

/** Chooses which provider receives mail for this domain. DNS is changed by that provider's own Setup. */
export async function PUT(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	const parsed = z
		.object({ provider: z.enum(["none", "cloudflare", "resend", "ses"]) })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json(
			{ error: "Unknown receiving provider" },
			{ status: 400 }
		);
	}
	await getDb(env)
		.update(domains)
		.set({ receivingProvider: parsed.data.provider })
		.where(eq(domains.id, domain.id));
	return Response.json(
		{ domain: await getDomainForUser(env, user.id, id) },
		{ headers: { "Cache-Control": "no-store" } }
	);
}

/** Which providers still have receiving configuration for this domain. */
export async function GET(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	return Response.json(await receivingPresence(env, domain), {
		headers: { "Cache-Control": "no-store" },
	});
}

/** Removes the configuration of a provider this domain is not receiving through. */
export async function DELETE(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	const parsed = z
		.object({ target: z.enum(["cloudflare", "resend", "ses"]) })
		.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Unknown provider" }, { status: 400 });
	}
	if (parsed.data.target === domain.receivingProvider) {
		return Response.json(
			{ error: "Switch to another provider before removing this one" },
			{ status: 400 }
		);
	}
	try {
		await removeReceiving(env, domain, parsed.data.target);
		return Response.json({ ok: true });
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not remove configuration",
			},
			{ status: 502 }
		);
	}
}
