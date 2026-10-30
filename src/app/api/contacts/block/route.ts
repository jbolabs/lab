import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { blockContact } from "@/lib/contacts/service";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

import type { BlockContactRequest } from "./types";

export async function POST(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const body = (await request.json()) as BlockContactRequest;
	if (!body.mailboxId || !body.address?.trim()) {
		return Response.json(
			{ error: "Mailbox and contact are required" },
			{ status: 400 }
		);
	}

	const access = await getMailboxAccessLevel(getDb(env), user, body.mailboxId);
	if (!access?.canManage) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const contact = await blockContact(env, {
		address: body.address,
		domainId: access.mailbox.domainId,
		mailboxId: access.mailbox.id,
		userId: access.mailbox.userId,
	});
	return Response.json({ contact });
}
