import { canManageDomains } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import {
	getResendDomainView,
	setupResendDomain,
	verifyResendDomainView,
} from "@/lib/domains/resend-domain";
import { getDomainForUser } from "@/lib/domains/service";
import { getResendKeyStatus } from "@/lib/email/outbound-provider";
import { ResendRestrictedKeyError } from "@/lib/email/resend-api";
import { sendSystemEmail } from "@/lib/email/system-mail";

interface Params {
	params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	if (domain.sendingProvider !== "resend") {
		return Response.json(
			{ error: "Resend is not selected for this domain" },
			{ status: 400 }
		);
	}
	const key = await getResendKeyStatus(env);
	if (!key.configured) {
		return Response.json(
			{ keyConfigured: false, resend: null },
			{ headers: { "Cache-Control": "no-store" } }
		);
	}
	try {
		return Response.json(
			{ keyConfigured: true, resend: await getResendDomainView(env, domain) },
			{ headers: { "Cache-Control": "no-store" } }
		);
	} catch (error) {
		// A send-only key is valid; it just cannot look at domains.
		if (error instanceof ResendRestrictedKeyError) {
			return Response.json(
				{ canManageDomains: false, keyConfigured: true, resend: null },
				{ headers: { "Cache-Control": "no-store" } }
			);
		}
		return Response.json(
			{
				error:
					error instanceof Error ? error.message : "Could not reach Resend",
			},
			{ status: 502 }
		);
	}
}

export async function POST(request: Request, { params }: Params) {
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
	const body = (await request.json().catch(() => ({}))) as { action?: string };
	if (
		body.action !== "setup" &&
		body.action !== "verify" &&
		body.action !== "test"
	) {
		return Response.json({ error: "Unknown action" }, { status: 400 });
	}
	try {
		if (body.action === "test") {
			const sent = await sendSystemEmail(env, {
				hostname: domain.hostname,
				subject: "Lab test email",
				text: `This message confirms ${domain.hostname} can send mail through Resend.`,
				to: user.email,
			});
			if (!sent) {
				return Response.json(
					{
						error: `Create a mailbox on ${domain.hostname} to send the test from.`,
					},
					{ status: 400 }
				);
			}
			return Response.json({ ok: true, to: user.email });
		}
		const resend =
			body.action === "setup"
				? await setupResendDomain(env, domain)
				: await verifyResendDomainView(env, domain);
		return Response.json(
			{ resend },
			{ headers: { "Cache-Control": "no-store" } }
		);
	} catch (error) {
		return Response.json(
			{
				error: error instanceof Error ? error.message : "Resend request failed",
			},
			{ status: 502 }
		);
	}
}
