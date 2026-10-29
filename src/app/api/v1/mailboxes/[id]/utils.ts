import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getMailboxUpdateValues } from "@/app/api/mailboxes/[id]/utils";
import { getDb } from "@/db";
import { mailboxes, users } from "@/db/schema";
import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { getEnv } from "@/lib/cloudflare";
import {
	ensureMailboxDomainRouting,
	removeMailboxDomainRouting,
} from "@/lib/mailboxes/domain-addresses";
import { updateMailboxSchema } from "@/lib/validators";

import type { AdminMailboxRouteParams } from "./types";

async function managedMailbox(request: Request, id: string) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "mailboxes");
	if (!auth) {
		return {
			env,
			error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
			mailbox: null,
		};
	}
	const [mailbox] = await getDb(env)
		.select({
			createdAt: mailboxes.createdAt,
			disabled: mailboxes.disabled,
			displayName: mailboxes.displayName,
			domainId: mailboxes.domainId,
			id: mailboxes.id,
			localPart: mailboxes.localPart,
			type: mailboxes.type,
			useAllDomains: mailboxes.useAllDomains,
			userId: mailboxes.userId,
		})
		.from(mailboxes)
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(
			and(
				eq(mailboxes.id, id),
				or(eq(users.id, auth.userId), eq(users.createdByUserId, auth.userId))
			)
		)
		.limit(1);
	if (!mailbox) {
		return {
			env,
			error: NextResponse.json({ error: "Mailbox not found" }, { status: 404 }),
			mailbox: null,
		};
	}
	return { env, error: null, mailbox };
}

export async function GET(
	request: Request,
	{ params }: AdminMailboxRouteParams
) {
	const resolvedParams = await params;

	const access = await managedMailbox(request, resolvedParams.id);
	if (access.error) {
		return access.error;
	}
	return NextResponse.json({ mailbox: access.mailbox });
}

export async function PATCH(
	request: Request,
	{ params }: AdminMailboxRouteParams
) {
	const resolvedParams = await params;

	const access = await managedMailbox(request, resolvedParams.id);
	if (access.error) {
		return access.error;
	}
	const parsed = updateMailboxSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten() },
			{ status: 400 }
		);
	}
	const db = getDb(access.env);
	if (parsed.data.useAllDomains === true) {
		try {
			await ensureMailboxDomainRouting(access.env, db, {
				domainId: access.mailbox.domainId,
				id: access.mailbox.id,
				localPart: access.mailbox.localPart,
				useAllDomains: true,
			});
		} catch (error) {
			return NextResponse.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to configure inbound routing",
				},
				{ status: 502 }
			);
		}
	}
	const values = getMailboxUpdateValues(parsed.data);
	if (Object.keys(values).length) {
		await db
			.update(mailboxes)
			.set(values)
			.where(eq(mailboxes.id, access.mailbox.id));
	}
	return NextResponse.json({ ok: true });
}

export async function DELETE(
	request: Request,
	{ params }: AdminMailboxRouteParams
) {
	const resolvedParams = await params;

	const access = await managedMailbox(request, resolvedParams.id);
	if (access.error) {
		return access.error;
	}
	const db = getDb(access.env);
	try {
		await removeMailboxDomainRouting(access.env, db, access.mailbox);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to remove Cloudflare routing rule",
			},
			{ status: 502 }
		);
	}
	await db.delete(mailboxes).where(eq(mailboxes.id, access.mailbox.id));
	return NextResponse.json({ ok: true });
}
