import { eq, or } from "drizzle-orm";

import { createAccountResponse } from "@/app/api/accounts/create";
import { accountListItemFromUser } from "@/app/api/accounts/utils";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { getEnv } from "@/lib/cloudflare";
import { createUserAccountSchema } from "@/lib/validators";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "accounts");
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const rows = await getDb(env)
		.select()
		.from(users)
		.where(
			or(eq(users.id, auth.userId), eq(users.createdByUserId, auth.userId))
		);
	return Response.json({ accounts: rows.map(accountListItemFromUser) });
}

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "accounts");
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const parsed = createUserAccountSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	if (parsed.data.role === "admin" && !isPrimaryAdmin(auth.user)) {
		return Response.json(
			{ error: "Only the primary admin can create admin accounts" },
			{ status: 403 }
		);
	}
	return createAccountResponse(env, auth.userId, parsed.data);
}
