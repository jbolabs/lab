import { createAuditLog } from "@/lib/mailboxes/audit";

import type {
	AuthActivityAction,
	AuthActivityMetadata,
} from "./activity-types";

function getHeaderValue(request: Request, name: string): string | null {
	const value = request.headers.get(name)?.trim();
	return value || null;
}

function getDevice(userAgent: string): string {
	if (/ipad|tablet/iu.test(userAgent)) {
		return "Tablet";
	}
	if (/mobi|iphone|android/iu.test(userAgent)) {
		return "Mobile";
	}
	return "Desktop";
}

function getRequestIpAddress(request: Request): string {
	const cfIp = getHeaderValue(request, "cf-connecting-ip");
	if (cfIp) {
		return cfIp;
	}
	const forwardedFor = getHeaderValue(request, "x-forwarded-for");
	return forwardedFor?.split(",")[0]?.trim() || "Unknown";
}

function getPlatform(userAgent: string): string {
	if (/windows/iu.test(userAgent)) {
		return "Windows";
	}
	if (/iphone|ipad|ios/iu.test(userAgent)) {
		return "iOS";
	}
	if (/android/iu.test(userAgent)) {
		return "Android";
	}
	if (/mac os|macintosh/iu.test(userAgent)) {
		return "macOS";
	}
	if (/linux/iu.test(userAgent)) {
		return "Linux";
	}
	return "Unknown";
}

export function getAuthActivityMetadata(
	request: Request
): AuthActivityMetadata {
	const userAgent = request.headers.get("user-agent") ?? "";
	return {
		city: getHeaderValue(request, "cf-ipcity"),
		country: getHeaderValue(request, "cf-ipcountry"),
		device: getDevice(userAgent),
		ipAddress: getRequestIpAddress(request),
		platform: getPlatform(userAgent),
		userAgent,
	};
}

export async function recordAuthActivity(
	env: CloudflareEnv,
	input: {
		action: AuthActivityAction;
		userId: string;
		request: Request;
	}
): Promise<void> {
	try {
		await createAuditLog(env, {
			action: input.action,
			actorUserId: input.userId,
			metadata: { ...getAuthActivityMetadata(input.request) },
			targetUserId: input.userId,
		});
	} catch {
		// Authentication should not fail because activity logging is unavailable.
	}
}
