import { eq } from "drizzle-orm";

import {
	selectAccountById,
	updateAccountCredentials,
} from "@/app/api/accounts/[id]/utils";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { deleteUserSessions } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { updateManagedAccountSchema } from "@/lib/validators";

import type { AdminAccountRouteParams } from "./types";

export async function GET(
	request: Request,
	{ params }: AdminAccountRouteParams
) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "accounts");
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const account = await selectAccountById(getDb(env), id);
	if (
		!account ||
		(account.id !== auth.userId && account.createdByUserId !== auth.userId)
	) {
		return Response.json({ error: "Account not found" }, { status: 404 });
	}
	return Response.json({
		account: {
			canManageMailboxes: account.canManageMailboxes,
			disabled: account.disabled,
			email: account.email,
			forwardingEmail: account.forwardingEmail,
			hasAvatar: !!account.avatarKey,
			id: account.id,
			name: account.name,
			role: account.role,
		},
	});
}

export async function PATCH(
	request: Request,
	{ params }: AdminAccountRouteParams
) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "accounts");
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const db = getDb(env);
	const account = await selectAccountById(db, id);
	if (
		!account ||
		(account.id !== auth.userId && account.createdByUserId !== auth.userId)
	) {
		return Response.json({ error: "Account not found" }, { status: 404 });
	}
	const parsed = updateManagedAccountSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	if (
		!isPrimaryAdmin(auth.user) &&
		(account.isPrimaryAdmin ||
			account.role === "admin" ||
			parsed.data.role !== account.role)
	) {
		return Response.json(
			{ error: "Only the primary admin can manage admin accounts" },
			{ status: 403 }
		);
	}
	await updateAccountCredentials(db, id, {
		name: parsed.data.name,
		password: parsed.data.password ?? null,
	});
	if (parsed.data.password) {
		await deleteUserSessions(env, id);
	}
	await db
		.update(users)
		.set({
			canManageMailboxes: parsed.data.canManageMailboxes,
			disabled: account.isPrimaryAdmin ? false : parsed.data.disabled,
			role: account.isPrimaryAdmin ? "admin" : parsed.data.role,
			...(isPrimaryAdmin(auth.user) &&
			parsed.data.canManageDomains !== undefined
				? { canManageDomains: parsed.data.canManageDomains }
				: {}),
			...(isPrimaryAdmin(auth.user) && parsed.data.canManageUsers !== undefined
				? { canManageUsers: parsed.data.canManageUsers }
				: {}),
			...(parsed.data.forwardingEmail === undefined
				? {}
				: { forwardingEmail: parsed.data.forwardingEmail }),
		})
		.where(eq(users.id, id));
	return Response.json({ ok: true });
}
