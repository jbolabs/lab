import { assertPrimaryAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { getBackupConfigurationStatus } from "@/lib/backups/export";
import { runDatabaseBackup } from "@/lib/backups/runner";
import {
	createBackupRecord,
	getBackupSettings,
	listBackups,
	updateBackupSettings,
} from "@/lib/backups/service";
import { getEnv } from "@/lib/cloudflare";

import { parseBackupSettingsInput } from "./utils";

async function requireAdmin(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	assertPrimaryAdmin(user);
	return { env, user };
}

export async function GET(request: Request) {
	try {
		const { env } = await requireAdmin(request);
		const [settings, backupList] = await Promise.all([
			getBackupSettings(env),
			listBackups(env),
		]);
		return Response.json({
			backups: backupList,
			configuration: getBackupConfigurationStatus(env),
			settings,
		});
	} catch {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
}

export async function PUT(request: Request) {
	try {
		const { env } = await requireAdmin(request);
		const input = parseBackupSettingsInput(await request.json());
		if (!input) {
			return Response.json(
				{ error: "Invalid backup settings" },
				{ status: 400 }
			);
		}
		await updateBackupSettings(env, input);
		return Response.json({ ok: true });
	} catch {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
}

export async function POST(request: Request) {
	try {
		const { env, user } = await requireAdmin(request);
		const backupId = await createBackupRecord(env, "manual", user.id);
		await runDatabaseBackup(env, backupId);
		return Response.json({ backupId });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to run backup";
		return Response.json({ error: message }, { status: 400 });
	}
}
