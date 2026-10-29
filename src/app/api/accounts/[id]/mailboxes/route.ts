import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { domains, mailboxes } from "@/db/schema";

import { requireTeamAdmin } from "../../utils";
import type { AccountRouteParams } from "../types";
import { selectAccountById } from "../utils";

export async function GET(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) {
		return access.error;
	}
	const { id } = await params;
	const db = getDb(access.env);
	const account = await selectAccountById(db, id);
	if (
		!account ||
		(account.id !== access.user.id &&
			account.createdByUserId !== access.user.id)
	) {
		return NextResponse.json({ error: "Account not found" }, { status: 404 });
	}
	const rows = await db
		.select({
			displayName: mailboxes.displayName,
			domainId: mailboxes.domainId,
			hostname: domains.hostname,
			id: mailboxes.id,
			localPart: mailboxes.localPart,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(eq(mailboxes.userId, id));
	return NextResponse.json({ mailboxes: rows });
}
