"use client";

import {
	AUTH_SESSION_CHANGED_EVENT,
	authFetch,
	getClientSessionToken,
} from "@/lib/auth/client";
import { requireValue } from "@/lib/require-value";

let epoch = 0;

export interface FolderListResponse {
	folders?: unknown[];
	error?: string;
}

const cache = new Map<
	string,
	{ expiresAt: number; data: FolderListResponse }
>();

const requests = new Map<string, Promise<FolderListResponse>>();

function invalidate(): void {
	epoch += 1;
	cache.clear();
	requests.clear();
}

let sessionEpoch = 0;

function invalidateSession(): void {
	sessionEpoch += 1;
	invalidate();
}

let listenersInstalled = false;

function installInvalidationListeners(): void {
	if (listenersInstalled || typeof window === "undefined") {
		return;
	}
	listenersInstalled = true;
	window.addEventListener(AUTH_SESSION_CHANGED_EVENT, invalidateSession);
	window.addEventListener("mailflare:messages-changed", invalidate);
	window.addEventListener("mailflare:folders-changed", invalidate);
}

export function invalidateFolderCache(): void {
	invalidate();
}

const CACHE_TTL_MS = 15_000;

const MAX_CACHE_ENTRIES = 32;

const MAX_INVALIDATION_RETRIES = 8;

export async function getMailboxFolders<
	T extends FolderListResponse = FolderListResponse,
>(mailboxId: string): Promise<T> {
	installInvalidationListeners();
	const sessionToken = getClientSessionToken();
	const requestSessionEpoch = sessionEpoch;
	const key = `${sessionToken ?? ""}\u0000${mailboxId}`;
	const createRequest = (requestEpoch: number): Promise<FolderListResponse> => {
		const pending: { promise?: Promise<FolderListResponse> } = {};
		const request: Promise<FolderListResponse> = (async () => {
			const params = new URLSearchParams({ mailboxId });
			const response = await authFetch(`/api/folders?${params.toString()}`, {
				cache: "no-store",
			});
			const data = (await response.json()) as FolderListResponse;
			if (!response.ok) {
				throw new Error(data.error ?? "Unable to load folders");
			}
			if (
				requestEpoch !== epoch ||
				sessionEpoch !== requestSessionEpoch ||
				sessionToken !== getClientSessionToken() ||
				requests.get(key) !== pending.promise
			) {
				throw new Error("Folder request was invalidated");
			}
			cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
			if (cache.size > MAX_CACHE_ENTRIES) {
				cache.delete(requireValue(cache.keys().next().value));
			}
			return data;
		})();
		pending.promise = request;
		return request;
	};

	for (let retries = 0; ; retries += 1) {
		if (
			sessionEpoch !== requestSessionEpoch ||
			sessionToken !== getClientSessionToken()
		) {
			throw new Error("Folder request was invalidated");
		}
		const now = Date.now();
		const cached = cache.get(key);
		if (cached && cached.expiresAt > now) {
			cache.delete(key);
			cache.set(key, cached);
			return cached.data as T;
		}
		if (cached) {
			cache.delete(key);
		}

		const requestEpoch = epoch;
		let request = requests.get(key);
		if (!request) {
			request = createRequest(requestEpoch);
			requests.set(key, request);
		}
		try {
			const data = await request;
			if (
				sessionEpoch !== requestSessionEpoch ||
				sessionToken !== getClientSessionToken()
			) {
				throw new Error("Folder request was invalidated");
			}
			if (requestEpoch !== epoch) {
				if (retries >= MAX_INVALIDATION_RETRIES) {
					throw new Error("Folder request was invalidated");
				}
				continue;
			}
			return data as T;
		} catch (error) {
			if (
				sessionEpoch !== requestSessionEpoch ||
				sessionToken !== getClientSessionToken()
			) {
				throw new Error("Folder request was invalidated", { cause: error });
			}
			if (requestEpoch === epoch || retries >= MAX_INVALIDATION_RETRIES) {
				throw error;
			}
		} finally {
			if (requests.get(key) === request) {
				requests.delete(key);
			}
		}
	}
}
