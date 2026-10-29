import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/api/auth";
import { getEnv } from "@/lib/cloudflare";
import { getVapidPublicKey } from "@/lib/push/server";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}

	const publicKey = getVapidPublicKey(env);
	return NextResponse.json({ enabled: !!publicKey, publicKey });
}
