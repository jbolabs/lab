import { eq } from "drizzle-orm";
import QRCode from "qrcode";

import { getDb } from "@/db";
import { mfaRecoveryCodes, users } from "@/db/schema";
import type { MfaEnrollment, MfaStatus } from "@/lib/auth/mfa-types";
import {
	consumeRecoveryCode,
	countUnusedRecoveryCodes,
	issueRecoveryCodes,
} from "@/lib/auth/recovery-codes";
import { deleteUserSessions } from "@/lib/auth/session";
import {
	buildOtpauthUrl,
	generateTotpSecret,
	verifyTotp,
} from "@/lib/auth/totp";
import { getBranding } from "@/lib/branding/service";

export async function getMfaStatus(
	env: CloudflareEnv,
	user: { id: string; totpEnabled: boolean; totpConfirmedAt: Date | null }
): Promise<MfaStatus> {
	return {
		confirmedAt: user.totpConfirmedAt?.toISOString() ?? null,
		enabled: user.totpEnabled,
		recoveryCodesLeft: user.totpEnabled
			? await countUnusedRecoveryCodes(env, user.id)
			: 0,
	};
}

/**
 * Start enrolment: a fresh secret is stored but not yet trusted. It only
 * becomes the account's second factor once `confirmMfaEnrollment` sees a
 * code generated from it, which proves the authenticator has it.
 */
export async function beginMfaEnrollment(
	env: CloudflareEnv,
	user: { id: string; email: string }
): Promise<MfaEnrollment> {
	const db = getDb(env);
	const secret = generateTotpSecret();
	await db
		.update(users)
		.set({ totpConfirmedAt: null, totpEnabled: false, totpSecret: secret })
		.where(eq(users.id, user.id));
	const { appName } = await getBranding(env);
	const otpauthUrl = buildOtpauthUrl({
		account: user.email,
		issuer: appName,
		secret,
	});
	const qrSvg = await QRCode.toString(otpauthUrl, {
		errorCorrectionLevel: "M",
		margin: 1,
		type: "svg",
	});
	return { otpauthUrl, qrSvg, secret };
}

export async function confirmMfaEnrollment(
	env: CloudflareEnv,
	user: { id: string; totpSecret: string | null; totpEnabled: boolean },
	code: string,
	currentSessionToken?: string
): Promise<
	{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }
> {
	if (!user.totpSecret) {
		return { error: "Start enrolment first", ok: false };
	}
	if (user.totpEnabled) {
		return { error: "Two-factor authentication is already on", ok: false };
	}
	if (!(await verifyTotp(user.totpSecret, code))) {
		return {
			error:
				"That code did not match. Check the time on your device and try again.",
			ok: false,
		};
	}

	const db = getDb(env);
	await db
		.update(users)
		.set({ totpConfirmedAt: new Date(), totpEnabled: true })
		.where(eq(users.id, user.id));
	const recoveryCodes = await issueRecoveryCodes(env, user.id);
	// Other sessions predate the second factor; make them sign in again with it.
	await deleteUserSessions(env, user.id, currentSessionToken);
	return { ok: true, recoveryCodes };
}

export async function disableMfa(
	env: CloudflareEnv,
	userId: string
): Promise<void> {
	const db = getDb(env);
	await db
		.update(users)
		.set({ totpConfirmedAt: null, totpEnabled: false, totpSecret: null })
		.where(eq(users.id, userId));
	await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
}

/** A login's second step: a TOTP code, or one of the recovery codes as a fallback. */
export async function verifySecondFactor(
	env: CloudflareEnv,
	user: { id: string; totpSecret: string | null; totpEnabled: boolean },
	code: string
): Promise<"totp" | "recovery" | null> {
	if (!user.totpEnabled || !user.totpSecret) {
		return null;
	}
	if (await verifyTotp(user.totpSecret, code)) {
		return "totp";
	}
	if (await consumeRecoveryCode(env, user.id, code)) {
		return "recovery";
	}
	return null;
}
