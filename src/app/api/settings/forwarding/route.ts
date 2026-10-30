import { eq } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";

import type { UpdateForwardingEmailInput } from "./types";
import { parseUpdateForwardingEmailRequest } from "./utils";

export async function PATCH(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	let input: UpdateForwardingEmailInput;
	try {
		input = await parseUpdateForwardingEmailRequest(request);
	} catch (error) {
		if (error instanceof ZodError) {
			return Response.json({ error: error.flatten() }, { status: 400 });
		}
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}

	await getDb(env)
		.update(users)
		.set({ forwardingEmail: input.forwardingEmail })
		.where(eq(users.id, user.id));

	return Response.json({ forwardingEmail: input.forwardingEmail });
}
