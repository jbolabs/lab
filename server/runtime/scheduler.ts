import { runAccountRetention } from "@/lib/accounts/deletion";
import { runAgentMaintenance } from "@/lib/agent/maintenance";
import { runScheduledDatabaseBackup } from "@/lib/backups/runner";
import { runDriveTrashRetention } from "@/lib/drive/retention";
import { runTrashRetention } from "@/lib/email/trash-retention";
import { runJmapChangeRetention } from "@/lib/jmap/changes";

async function reportFailure(task: Promise<unknown>, message: string) {
	try {
		await task;
	} catch (error) {
		console.error(message, error);
	}
}

/** Fire the daily 02:00 UTC backup and the recurring maintenance jobs, matching the cron triggers in wrangler.jsonc. */
export function startScheduler(env: CloudflareEnv) {
	let lastRunDay = "";
	const timer = setInterval(() => {
		void reportFailure(runAgentMaintenance(env), "Agent maintenance failed");
		void reportFailure(runTrashRetention(env), "Trash retention failed");
		const now = new Date();
		const day = now.toISOString().slice(0, 10);
		if (now.getUTCHours() !== 2 || lastRunDay === day) {
			return;
		}
		lastRunDay = day;
		void reportFailure(
			runScheduledDatabaseBackup(env, now),
			"Scheduled backup failed"
		);
		void reportFailure(
			runDriveTrashRetention(env, now),
			"Drive trash retention failed"
		);
		void reportFailure(
			runAccountRetention(env, now),
			"Account retention failed"
		);
		void reportFailure(
			runJmapChangeRetention(env, now),
			"JMAP change retention failed"
		);
	}, 60_000);
	return () => clearInterval(timer);
}
