"use client";

import { authFetch, getClientSessionToken } from "@/lib/auth/client";

const PUSH_ENABLED_KEY = "mailflare:push-enabled";
export const PUSH_STATE_CHANGED_EVENT = "mailflare:push-state-changed";

type PushConfigResponse = { enabled: boolean; publicKey: string | null };
export type PushState = {
	supported: boolean;
	needsInstall: boolean;
	configured: boolean;
	permission: NotificationPermission | "unsupported";
	subscribed: boolean;
};

let pending: Promise<unknown> = Promise.resolve();

// Settings and launch/resume can overlap. Serialize saves and opt-outs, including across tabs.
function withPushLock<T>(operation: () => Promise<T>): Promise<T> {
	const run = async (): Promise<T> => {
		if (navigator.locks) return await navigator.locks.request("mailflare:push-subscription", operation);
		return operation();
	};
	const result = pending.then(run, run);
	pending = result.catch(() => undefined);
	return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}

function decodeBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function needsHomeScreenInstall(): boolean {
	if (typeof window === "undefined") return false;
	const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const installed = window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	return ios && !installed;
}

export function browserSupportsPush(): boolean {
	return typeof window !== "undefined" && window.isSecureContext &&
		"serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerMailflareServiceWorker(): Promise<ServiceWorkerRegistration> {
	if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported by this browser");
	await navigator.serviceWorker.register("/sw.js", { scope: "/" });
	return navigator.serviceWorker.ready;
}

function wantsPush(): boolean | null {
	try {
		const stored = localStorage.getItem(PUSH_ENABLED_KEY);
		return stored === null ? null : stored === "true";
	} catch {
		return null;
	}
}

function rememberPush(enabled: boolean): void {
	try { localStorage.setItem(PUSH_ENABLED_KEY, String(enabled)); } catch {
		// An existing subscription still works when storage is unavailable.
	}
}

async function loadPushConfig(token: string): Promise<PushConfigResponse> {
	const response = await authFetch("/api/push/config", {
		headers: { Authorization: `Bearer ${token}` }, redirectOnUnauthorized: false,
	});
	if (!response.ok) throw new Error("Could not check notifications. Try again.");
	return (await response.json()) as PushConfigResponse;
}

async function saveSubscription(subscription: PushSubscription, token: string): Promise<void> {
	// Async work from the previous account must never register with the next account's token.
	if (getClientSessionToken() !== token) throw new Error("Your account changed. Try again.");
	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
		throw new Error("Could not set up notifications. Try again.");
	}
	const response = await authFetch("/api/push/subscriptions", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
		redirectOnUnauthorized: false,
	});
	if (!response.ok) throw new Error("Could not save notifications. Try again.");
	if (getClientSessionToken() !== token) throw new Error("Your account changed. Try again.");
}

/** Refresh existing opt-ins on launch/resume without ever requesting permission. */
export function getPushState(): Promise<PushState> {
	return withPushLock(readPushState);
}

async function readPushState(): Promise<PushState> {
	const needsInstall = needsHomeScreenInstall();
	if (!browserSupportsPush() || needsInstall) {
		return { supported: false, needsInstall, configured: false, permission: "unsupported", subscribed: false };
	}
	const token = getClientSessionToken();
	if (!token) return { supported: true, needsInstall, configured: false, permission: Notification.permission, subscribed: false };
	const [config, registration] = await Promise.all([loadPushConfig(token), registerMailflareServiceWorker()]);
	let subscription = await registration.pushManager.getSubscription();
	const configured = config.enabled && !!config.publicKey;
	if (configured && Notification.permission === "granted" && wantsPush() !== false) {
		if (!subscription && wantsPush() === true && getClientSessionToken() === token) {
			try {
				subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true, applicationServerKey: toArrayBuffer(decodeBase64Url(config.publicKey!)),
				});
			} catch {
				// Some browsers require a fresh gesture to renew. Leave the switch available to retry.
			}
		}
		if (subscription) {
			await saveSubscription(subscription, token);
			rememberPush(true);
		}
	}
	return {
		supported: true, needsInstall, configured, permission: Notification.permission,
		subscribed: !!subscription && wantsPush() !== false && Notification.permission === "granted",
	};
}

export async function enablePushNotifications(): Promise<void> {
	if (!browserSupportsPush() || needsHomeScreenInstall()) throw new Error("Open the Lab from your Home Screen to enable notifications.");
	const token = getClientSessionToken();
	if (!token) throw new Error("Sign in to enable notifications.");
	// Keep the permission request directly on the user's tap, before any network work.
	const permission = await Notification.requestPermission();
	if (permission !== "granted") throw new Error("Notifications weren’t allowed. You can change this in notification settings.");
	await withPushLock(async () => {
		const config = await loadPushConfig(token);
		if (!config.enabled || !config.publicKey) throw new Error("Notifications aren’t available yet. Try again later.");
		const registration = await registerMailflareServiceWorker();
		const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
			userVisibleOnly: true, applicationServerKey: toArrayBuffer(decodeBase64Url(config.publicKey)),
		});
		await saveSubscription(subscription, token);
		rememberPush(true);
		window.dispatchEvent(new Event(PUSH_STATE_CHANGED_EVENT));
	});
}

export function disablePushNotifications(): Promise<void> {
	return withPushLock(disableSubscription);
}

async function disableSubscription(): Promise<void> {
	const token = getClientSessionToken();
	if (!token) throw new Error("Sign in to change notifications.");
	const registration = await navigator.serviceWorker.getRegistration("/");
	const subscription = await registration?.pushManager.getSubscription();
	if (subscription) {
		const response = await authFetch("/api/push/subscriptions", {
			method: "DELETE",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ endpoint: subscription.endpoint }), redirectOnUnauthorized: false,
		});
		if (!response.ok) throw new Error("Could not turn off notifications. Try again.");
	}
	// Persist the opt-out before unsubscribe, so a failed unsubscribe cannot re-enable it on resume.
	rememberPush(false);
	await subscription?.unsubscribe();
	window.dispatchEvent(new Event(PUSH_STATE_CHANGED_EVENT));
}
