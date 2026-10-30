import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { hasCloudflareCredentials, isNodeRuntime } from "@/lib/runtime";
import { hasPrimaryDomain, userHasMailboxes } from "@/lib/user";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let hasMailboxes = false;
	let isSetup = true;
	try {
		[hasMailboxes, isSetup] = await Promise.all([
			userHasMailboxes(env, user.id),
			hasPrimaryDomain(env),
		]);
	} catch {
		// Authentication remains valid when optional mailbox/setup metadata is unavailable.
	}
	return Response.json({
		hasMailboxes,
		isSetup,
		managesDns: hasCloudflareCredentials(env),
		runtime: isNodeRuntime(env) ? "node" : "cloudflare",
		user: {
			canForwardEmail: true,
			canManageDomains: user.canManageDomains,
			canManageMailboxes: user.canManageMailboxes,
			canManageUsers: user.canManageUsers,
			email: user.email,
			forwardingEmail: user.forwardingEmail,
			hasAvatar: !!user.avatarKey,
			id: user.id,
			isPrimaryAdmin: user.isPrimaryAdmin,
			keyboardShortcutsEnabled: user.keyboardShortcutsEnabled,
			mfaEnabled: user.totpEnabled,
			name: user.name,
			resetEmail: user.resetEmail,
			role: user.role,
			showFullRecipientAddresses: user.showFullRecipientAddresses,
			spamProtectionEnabled: user.spamProtectionEnabled,
			timeZone: user.timeZone,
		},
	});
}
