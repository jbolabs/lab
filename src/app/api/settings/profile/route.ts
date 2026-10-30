import { eq } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { syncPersonalIdentity } from "@/lib/profile/sync";

import type { UpdateProfileInput } from "./types";
import { parseUpdateProfileRequest } from "./utils";

export async function PATCH(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	let parsed: UpdateProfileInput;
	try {
		parsed = await parseUpdateProfileRequest(request);
	} catch (error) {
		if (error instanceof ZodError) {
			return Response.json({ error: error.flatten() }, { status: 400 });
		}
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}

	const db = getDb(env);
	const forwardingEmail =
		parsed.forwardingEmail === undefined
			? user.forwardingEmail
			: parsed.forwardingEmail;
	await syncPersonalIdentity(db, {
		avatarKey: user.avatarKey,
		name: parsed.name,
		userId: user.id,
	});
	await db
		.update(users)
		.set({ forwardingEmail, resetEmail: parsed.resetEmail })
		.where(eq(users.id, user.id));

	return Response.json({
		user: {
			canForwardEmail: true,
			email: user.email,
			forwardingEmail,
			id: user.id,
			name: parsed.name,
			resetEmail: parsed.resetEmail,
		},
	});
}
