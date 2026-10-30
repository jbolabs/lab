import { desc, inArray, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { assertPrimaryAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";

export async function GET(request: Request) {
	const env = getEnv();
	const admin = await requireUser(env, request);
	try {
		assertPrimaryAdmin(admin);
	} catch {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}

	const url = new URL(request.url);
	const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);
	const rows = await getDb(env)
		.select({
			action: auditLogs.action,
			actorEmail: users.email,
			createdAt: auditLogs.createdAt,
			id: auditLogs.id,
			metadata: auditLogs.metadata,
		})
		.from(auditLogs)
		.leftJoin(users, eq(users.id, auditLogs.actorUserId))
		.where(inArray(auditLogs.action, ["auth.login", "auth.logout"]))
		.orderBy(desc(auditLogs.createdAt))
		.limit(limit);

	return Response.json({ activities: rows });
}
