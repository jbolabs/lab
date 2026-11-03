import { getDb } from "@/db";
import { requireSessionUser } from "@/lib/api/auth";
import { authenticateApiKeyValue, hasScope } from "@/lib/api/key-auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";

import { DriveFailure } from "./errors";
import { redeemDriveTransferToken } from "./transfer";
import type { DriveTransferAction } from "./transfer";

export interface DriveAuthOptions {
	/** Also accept a signed URL (`?token=`) issued for this item and action. */
	transfer?: { itemId: string; action: DriveTransferAction };
	/** Email attachments are mail data, so only the signed-in app reaches them. */
	sessionOnly?: boolean;
}

/**
 * Every Drive route authenticates here: the web session (writes also need a same-origin request), an API key with
 * `drive:read` / `drive:write`, or a signed transfer URL where the route allows one.
 */
export async function authorizeDrive(
	request: Request,
	mutation = false,
	options: DriveAuthOptions = {}
) {
	const env = getEnv();
	const db = getDb(env);
	const token = options.transfer
		? new URL(request.url).searchParams.get("token")
		: null;
	if (options.transfer && token) {
		const user = await redeemDriveTransferToken(
			env,
			token,
			options.transfer.itemId,
			options.transfer.action
		);
		return user
			? ({ db, env, error: null, user, via: "transfer" } as const)
			: ({
					error: Response.json(
						{ error: "This link has expired" },
						{ status: 401 }
					),
				} as const);
	}
	const authorization = request.headers.get("Authorization") ?? "";
	if (authorization.startsWith("Bearer ep_")) {
		if (options.sessionOnly) {
			return {
				error: Response.json(
					{ error: "Email attachments are only available in the app" },
					{ status: 403 }
				),
			} as const;
		}
		const key = await authenticateApiKeyValue(env, authorization.slice(7));
		if (!key) {
			return {
				error: Response.json({ error: "Unauthorized" }, { status: 401 }),
			} as const;
		}
		const scope = mutation ? "drive:write" : "drive:read";
		if (!hasScope(key.scopes, scope)) {
			return {
				error: Response.json(
					{ error: `This key needs the ${scope} scope` },
					{ status: 403 }
				),
			} as const;
		}
		return { db, env, error: null, user: key.user, via: "key" } as const;
	}
	const { user, error } = await requireSessionUser(env, request);
	if (error) {
		return { error } as const;
	}
	if (mutation && !hasValidSessionMutationOrigin(request)) {
		return {
			error: Response.json({ error: "Invalid origin" }, { status: 403 }),
		} as const;
	}
	return { db, env, error: null, user, via: "session" } as const;
}

/** Runs a Drive route body; a DriveFailure becomes `{ error }` with its status, anything else is returned as JSON. */
export async function driveResponse(
	run: () => Promise<unknown>
): Promise<Response> {
	try {
		const result = await run();
		return result instanceof Response ? result : Response.json(result);
	} catch (error) {
		if (error instanceof DriveFailure) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		throw error;
	}
}
