import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/api/auth";
import { getMfaStatus } from "@/lib/auth/mfa";
import { getEnv } from "@/lib/cloudflare";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	return NextResponse.json(await getMfaStatus(env, auth.user));
}
