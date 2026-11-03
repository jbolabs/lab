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
