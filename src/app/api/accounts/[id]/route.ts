import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { canManageUsers, isPrimaryAdmin } from "@/lib/auth/admin";
import { deleteUserSessions } from "@/lib/auth/session";
import { updateManagedAccountSchema } from "@/lib/validators";

import { requireTeamAdmin } from "../utils";
import type { AccountRouteParams } from "./types";
import { selectAccountById, updateAccountCredentials } from "./utils";

export async function GET(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) {
		return access.error;
	}
	const { id } = await params;
	const account = await selectAccountById(getDb(access.env), id);
	if (!account) {
		return Response.json({ error: "Account not found" }, { status: 404 });
	}
	const actor = access.user;
	return Response.json({
		account: {
			canChangeRole: isPrimaryAdmin(actor),
			canForwardEmail: true,
			canManageDomains: account.canManageDomains,
			canManageMailboxes: account.canManageMailboxes,
			canManageUsers: account.canManageUsers,
			canTransferPrimary:
				isPrimaryAdmin(actor) && !account.isPrimaryAdmin && !account.disabled,
			disabled: account.disabled,
			editable:
				isPrimaryAdmin(actor) ||
				(canManageUsers(actor) &&
					account.role === "user" &&
					!account.isPrimaryAdmin),
			email: account.email,
			forwardingEmail: account.forwardingEmail,
			hasAvatar: !!account.avatarKey,
			id: account.id,
			isPrimaryAdmin: account.isPrimaryAdmin,
			name: account.name,
			role: account.role,
		},
	});
}

export async function PATCH(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) {
		return access.error;
	}
	const { id } = await params;
	const db = getDb(access.env);
	const account = await selectAccountById(db, id);
	if (!account) {
		return Response.json({ error: "Account not found" }, { status: 404 });
	}
	if (account.deletedAt) {
		return Response.json(
			{ error: "This account is deleted. Restore it first" },
			{ status: 409 }
		);
	}
	const actor = access.user;
	const actorIsPrimary = isPrimaryAdmin(actor);
	if (!actorIsPrimary && !canManageUsers(actor)) {
		return Response.json(
			{ error: "You do not have permission to manage users" },
			{ status: 403 }
		);
	}
	// Admins without the primary role can only manage plain user accounts.
	if (!actorIsPrimary && (account.role === "admin" || account.isPrimaryAdmin)) {
		return Response.json(
			{ error: "Only the primary admin can manage admin accounts" },
			{ status: 403 }
		);
	}
	const parsed = updateManagedAccountSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	if (!actorIsPrimary && parsed.data.role !== account.role) {
		return Response.json(
			{ error: "Only the primary admin can change roles" },
			{ status: 403 }
		);
	}
	await updateAccountCredentials(db, id, {
		name: parsed.data.name,
		password: parsed.data.password ?? null,
	});
	// A password set by an admin is a reset: whoever held the old one is signed out.
	if (parsed.data.password) {
		await deleteUserSessions(access.env, id);
	}
	// The primary admin always stays an enabled admin; only a transfer can move the role.
	const role = (() => {
		if (account.isPrimaryAdmin) {
			return "admin";
		}
		if (actorIsPrimary) {
			return parsed.data.role;
		}
		return account.role;
	})();
	const disabled = account.isPrimaryAdmin ? false : parsed.data.disabled;
	await db
		.update(users)
		.set({
			canManageMailboxes: parsed.data.canManageMailboxes,
			disabled,
			role,
			...(actorIsPrimary && parsed.data.canManageDomains !== undefined
				? { canManageDomains: parsed.data.canManageDomains }
				: {}),
			...(actorIsPrimary && parsed.data.canManageUsers !== undefined
				? { canManageUsers: parsed.data.canManageUsers }
				: {}),
			...(parsed.data.forwardingEmail === undefined
				? {}
				: { forwardingEmail: parsed.data.forwardingEmail }),
		})
		.where(eq(users.id, id));
	return Response.json({ ok: true });
}
