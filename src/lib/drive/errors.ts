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
 * their real cause; the client gets a generic message, so storage and SQL details never leak.
 */
export function describeDriveError(
	error: unknown,
	operation: string
): { message: string; status: number } {
	if (error instanceof DriveFailureError) {
		return { message: error.message, status: error.status };
	}
	console.error(`Drive ${operation} failed`, error);
	return { message: `Drive ${operation} failed`, status: 500 };
}
