import { getDb } from "@/db";
import { deleteAccounts } from "@/lib/accounts/deletion";
import { canManageUsers, isPrimaryAdmin } from "@/lib/auth/admin";
import { createUserAccountSchema } from "@/lib/validators";

import { createAccountResponse } from "./create";
import {
	accountListItemFromUser,
	listAccountsForAdmin,
	requireTeamAdmin,
} from "./utils";

export async function GET(request: Request) {
	const access = await requireTeamAdmin(request);
	if (access.error) {
		return access.error;
	}
	const rows = await listAccountsForAdmin(getDb(access.env));
	return Response.json({
		accounts: rows.map((row) => accountListItemFromUser(row)),
	});
}

export async function POST(request: Request) {
	const access = await requireTeamAdmin(request);
	if (access.error) {
		return access.error;
	}
	const parsed = createUserAccountSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	const actor = access.user;
	if (!canManageUsers(actor)) {
		return Response.json(
			{ error: "You do not have permission to manage users" },
			{ status: 403 }
		);
	}
	if (parsed.data.role === "admin" && !isPrimaryAdmin(actor)) {
		return Response.json(
			{ error: "Only the primary admin can create admin accounts" },
			{ status: 403 }
		);
	}
	return createAccountResponse(access.env, actor.id, parsed.data);
}

export async function DELETE(request: Request) {
	const access = await requireTeamAdmin(request);
	if (access.error) {
		return access.error;
	}
	const body = (await request.json().catch(() => null)) as {
		ids?: unknown;
		transferToId?: unknown;
	} | null;
	const ids = Array.isArray(body?.ids)
		? body.ids.filter((id): id is string => typeof id === "string" && !!id)
		: [];
	const transferToId =
		typeof body?.transferToId === "string" ? body.transferToId : null;
	const result = await deleteAccounts(access.env, access.user, {
		ids,
		transferToId,
	});
	if (!result.ok) {
		return Response.json({ error: result.error }, { status: result.status });
	}
	return Response.json({ deleted: result.deleted, ok: true });
}
