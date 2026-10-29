import { NextResponse } from "next/server";

import { authenticateApiRequest, hasScope } from "@/lib/api/key-auth";
import type { ApiAuthResult } from "@/lib/api/key-auth-types";
import { getCurrentUser } from "@/lib/auth/cookies";

import type { CalendarAuthorization } from "./api-auth-types";

export async function authorizeCalendarRequest(
	env: CloudflareEnv,
	request: Request,
	scope: "calendar:read" | "calendar:write"
): Promise<CalendarAuthorization> {
	const authorization = request.headers.get("Authorization") ?? "";
	if (
		authorization.startsWith("Bearer ep_") ||
		authorization.startsWith("Basic ")
	) {
		const key = await authenticateApiRequest(env, request);
		if (!key) {
			return {
				error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
				key: null,
				user: null,
			};
		}
		if (!hasScope(key.scopes, scope)) {
			return {
				error: NextResponse.json(
					{ error: "Permission denied" },
					{ status: 403 }
				),
				key: null,
				user: null,
			};
		}
		return { error: null, key, user: key.user };
	}
	const user = await getCurrentUser(env, request);
	return user
		? { error: null, key: null, user }
		: {
				error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
				key: null,
				user: null,
			};
}

export function calendarKeyCanSendInvitations(
	key: ApiAuthResult | null,
	mailboxId: string | null | undefined
): boolean {
	return (
		!key ||
		(!!mailboxId &&
			hasScope(key.scopes, "send") &&
			(key.mailboxIds === null || key.mailboxIds.includes(mailboxId)))
	);
}
