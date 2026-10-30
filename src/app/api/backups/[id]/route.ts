import { assertPrimaryAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { deleteBackup } from "@/lib/backups/service";
import { getEnv } from "@/lib/cloudflare";

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const env = getEnv();
	try {
		const user = await requireUser(env, request);
		assertPrimaryAdmin(user);
		const { id } = await params;
		const deleted = await deleteBackup(env, id);
		if (!deleted) {
			return Response.json({ error: "Backup not found" }, { status: 404 });
		}
		return Response.json({ ok: true });
	} catch {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
}
