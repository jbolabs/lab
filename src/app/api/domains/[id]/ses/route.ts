import { canManageDomains } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { AwsError } from "@/lib/aws/client";
import { getAwsConfig } from "@/lib/aws/config";
import { getSesSendingView, setupSesSending } from "@/lib/aws/ses-sending";
import { getEnv } from "@/lib/cloudflare";
import { getDomainForUser } from "@/lib/domains/service";
import { sendSystemEmail } from "@/lib/email/system-mail";

interface Params {
	params: Promise<{ id: string }>;
}
const noStore = { "Cache-Control": "no-store" };

/** SES sending status for a domain: identity, DKIM, DNS and sandbox state. */
export async function GET(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	if (!(await getAwsConfig(env))) {
		return Response.json(
			{ credentials: false, ses: null },
			{ headers: noStore }
		);
	}
	try {
		return Response.json(
			{ credentials: true, ses: await getSesSendingView(env, domain) },
			{ headers: noStore }
		);
	} catch (error) {
		if (error instanceof AwsError && error.accessDenied) {
			return Response.json(
				{
					credentials: true,
					error:
						"These AWS credentials cannot manage SES identities. Re-check them under AWS credentials.",
					ses: null,
				},
				{ headers: noStore }
			);
		}
		return Response.json(
			{ error: error instanceof Error ? error.message : "Could not reach AWS" },
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
	try {
		if (body.action === "test") {
			const sent = await sendSystemEmail(env, {
				hostname: domain.hostname,
				subject: "Lab test email",
				text: `This message confirms ${domain.hostname} can send mail through Amazon SES.`,
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
		if (body.action === "setup") {
			return Response.json(
				{ ses: await setupSesSending(env, domain) },
				{ headers: noStore }
			);
		}
		if (body.action === "verify") {
			return Response.json(
				{ ses: await getSesSendingView(env, domain) },
				{ headers: noStore }
			);
		}
		return Response.json({ error: "Unknown action" }, { status: 400 });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : "AWS request failed" },
			{ status: 502 }
		);
	}
}
