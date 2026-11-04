import { getMigrationStatus } from "@/lib/migrations/service";

/** A Drive failure the caller can act on: the message is safe to show, the status is the HTTP status. */
class DriveFailureError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.name = "DriveFailureError";
		this.status = status;
	}
}

export { DriveFailureError as DriveFailure };

/**
 * Turns any error from a Drive operation into a message a client can act on. Unexpected errors are logged with
 * their real cause; the client is told when the database is missing a migration (the usual reason a deployed
 * feature fails everywhere) and otherwise gets a generic message, so storage and SQL details never leak.
 */
export async function describeDriveError(
	env: CloudflareEnv,
	error: unknown,
	operation: string
): Promise<{ message: string; status: number }> {
	if (error instanceof DriveFailureError) {
		return { message: error.message, status: error.status };
	}
	console.error(`Drive ${operation} failed`, error);
	const pending = await getMigrationStatus(env.DB)
		.then((status) => status.pending)
		.catch(() => []);
	if (pending.length) {
		return {
			message: `Drive ${operation} failed: the database has pending migrations (${pending.join(", ")}). An admin can apply them from the Admin overview.`,
			status: 503,
		};
	}
	return { message: `Drive ${operation} failed`, status: 500 };
}
