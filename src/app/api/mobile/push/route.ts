import { z } from "zod";

import { authenticateApiRequest, hasScope } from "@/lib/api/key-auth";
import { getEnv } from "@/lib/cloudflare";
import { readJsonBody } from "@/lib/http/request";
import {
	canDeliverTo,
	registerPushDevice,
	unregisterPushDevice,
} from "@/lib/push/native";
import { isValidDevicePublicKey } from "@/lib/push/native-crypto";
import { isRelayHandle } from "@/lib/push/relay";

const registrationSchema = z.object({
	accountRef: z.string().min(1).max(100).optional(),
	environment: z.enum(["production", "sandbox"]).default("production"),
	platform: z.literal("apns"),
	previews: z.boolean().default(true),
	publicKey: z.string().max(200).nullable().default(null),
	token: z
		.string()
		.regex(/^(?:[0-9a-fA-F]{32,200}|mfr1\.[A-Za-z0-9_-]{20,1000})$/u),
	topic: z.string().min(3).max(200),
});

async function authenticate(env: CloudflareEnv, request: Request) {
	const auth = await authenticateApiRequest(env, request);
	if (!auth) {
		return {
			auth: null,
			error: Response.json({ error: "Unauthorized" }, { status: 401 }),
		} as const;
	}
	if (!hasScope(auth.scopes, "jmap")) {
		return {
			auth: null,
			error: Response.json(
				{ error: "This key does not have the jmap scope" },
				{ status: 403 }
			),
		} as const;
	}
	return { auth, error: null } as const;
}

/**
 * The mobile app registers its APNs token here, authenticated with the same
 * device key it uses for JMAP. Revoking the key removes the registration.
 */
export async function PUT(request: Request) {
	const env = getEnv();
	const { auth, error } = await authenticate(env, request);
	if (error) {
		return error;
	}
	const parsed = registrationSchema.safeParse(
		await readJsonBody(request, 8 * 1024).catch(() => null)
	);
	if (!parsed.success) {
		return Response.json({ error: "Invalid registration" }, { status: 400 });
	}
	if (parsed.data.publicKey && !isValidDevicePublicKey(parsed.data.publicKey)) {
		return Response.json(
			{ error: "publicKey must be a raw uncompressed P-256 point" },
			{ status: 400 }
		);
	}
	const { accountRef, ...registration } = parsed.data;
	await registerPushDevice(env, auth.userId, auth.keyId, {
		...registration,
		clientRef: accountRef ?? null,
		token: isRelayHandle(registration.token)
			? registration.token
			: registration.token.toLowerCase(),
	});
	// Registrations are kept without APNs secrets, but nothing is sent; the app shows that instead of "On".
	return Response.json({
		deliverable: canDeliverTo(env, registration.token),
		ok: true,
	});
}

export async function DELETE(request: Request) {
	const env = getEnv();
	const { auth, error } = await authenticate(env, request);
	if (error) {
		return error;
	}
	await unregisterPushDevice(env, auth.keyId);
	return Response.json({ ok: true });
}
