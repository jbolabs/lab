import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { mailboxes, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { hasAdminAccount } from "@/lib/auth/setup";
import { verifyTurnstileToken } from "@/lib/auth/turnstile";
import { ensureBookingUsername } from "@/lib/booking/username";
import { getEnv } from "@/lib/cloudflare";
import { ensureEmailRoutingRuleToWorker } from "@/lib/cloudflare-api";
import { getDomainProvisioningError } from "@/lib/domains/errors";
import { rollbackDomainProvisioning } from "@/lib/domains/rollback";
import { addDomainForUser } from "@/lib/domains/service";
import type { DomainProvisioningChanges } from "@/lib/domains/types";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { newId } from "@/lib/ids";
import { ensureMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";
import { firstRunRegisterSchema } from "@/lib/validators";

export async function POST(request: Request) {
	const env = getEnv();
	const db = getDb(env);
	if (await hasAdminAccount(env)) {
		return NextResponse.json(
			{ error: "Registration is closed after the first account is created" },
			{ status: 403 }
		);
	}

	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return NextResponse.json(
			{ error: "Invalid registration request" },
			{ status }
		);
	}
	const firstRunParsed = firstRunRegisterSchema.safeParse(body);
	if (!firstRunParsed.success) {
		return NextResponse.json(
			{ error: firstRunParsed.error.flatten() },
			{ status: 400 }
		);
	}
	if (
		!(await verifyTurnstileToken(
			env,
			request,
			(body as Record<string, unknown>).turnstileToken
		))
	) {
		return NextResponse.json(
			{ error: "Verification failed. Please try again." },
			{ status: 400 }
		);
	}

	const domainName = firstRunParsed.data.domain.toLowerCase().trim();
	const username = firstRunParsed.data.username.toLowerCase().trim();
	const email = `${username}@${domainName}`;
	const { password } = firstRunParsed.data;
	const name = username;

	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (existing) {
		return NextResponse.json(
			{ error: "Email already registered" },
			{ status: 409 }
		);
	}

	const userId = newId("usr");
	await db.insert(users).values({
		email,
		id: userId,
		isPrimaryAdmin: true,
		name,
		passwordHash: hashPassword(password),
		resetEmail: firstRunParsed.data.resetEmail,
		role: "admin",
	});

	// Tracks what the attempt changed on the Cloudflare zone so a failure can undo
	// precisely that. The DB is not a reliable source for this: the same errors that
	// abort registration (an unmigrated schema, a dead D1 binding) also stop the
	// domain row from ever being written, which is exactly when the orphaned zone
	// config would go unnoticed.
	let changes: DomainProvisioningChanges | null = null;
	try {
		await ensureBookingUsername(env, userId, email);
		const added = await addDomainForUser(env, userId, domainName, {
			enableRouting: true,
			enableSending: firstRunParsed.data.enableSending ?? true,
			replaceMxRecords: firstRunParsed.data.replaceMxRecords,
			skipDns: firstRunParsed.data.skipDns,
		});
		const { domain } = added;
		({ changes } = added);
		await ensureEmailRoutingRuleToWorker(env, domain.zoneId, email);
		changes.createdAddressRules.push(email);
		const mailboxId = newId("mbx");
		await db.insert(mailboxes).values({
			displayName: username,
			domainId: domain.id,
			id: mailboxId,
			localPart: username,
			userId,
		});
		await ensureMailboxDomainRouting(env, db, {
			domainId: domain.id,
			id: mailboxId,
			localPart: username,
			useAllDomains: true,
		});
	} catch (error) {
		if (changes) {
			await rollbackDomainProvisioning(env, changes);
		}
		try {
			// The domain row cascades with the user.
			await db.delete(users).where(eq(users.id, userId));
		} catch (cleanupError) {
			console.warn(
				"Failed to remove the partial user after registration failure",
				cleanupError
			);
		}
		const failure = getDomainProvisioningError(
			error,
			"Domain setup failed",
			502
		);
		return NextResponse.json(
			{ code: failure.code, error: failure.message },
			{ status: failure.status }
		);
	}

	const response = NextResponse.json({ ok: true, redirect: "/login" });
	response.headers.set("Cache-Control", "no-store");
	response.cookies.set(SESSION_COOKIE, "", {
		httpOnly: true,
		maxAge: 0,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
	return response;
}
