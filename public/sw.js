const DEFAULT_NOTIFICATION = {
	title: "New email",
	body: "You have a new message",
	icon: "/icon-192.png",
	badge: "/icon-96.png",
	url: "/inbox",
};

async function syncAppBadge() {
	if (!("setAppBadge" in self.navigator)) return;
	try {
		const response = await fetch("/api/messages/counts", { credentials: "include" });
		if (!response.ok) return;
		const unread = (await response.json())?.counts?.folders?.inbox?.unread;
		if (typeof unread !== "number") return;
		await (unread > 0 ? self.navigator.setAppBadge(unread) : self.navigator.clearAppBadge());
	} catch {
		// Leave the badge as it was when the network is down or the API rejects outside an installed app.
	}
}

self.addEventListener("push", (event) => {
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			if (windows.some((client) => client.visibilityState === "visible")) return;

			let payload = DEFAULT_NOTIFICATION;
			try {
				payload = { ...DEFAULT_NOTIFICATION, ...(event.data?.json() ?? {}) };
			} catch {
				// Keep the generic notification if a provider delivers an empty or malformed payload.
			}

			await Promise.all([
				self.registration.showNotification(payload.title, {
					body: payload.body,
					icon: payload.icon,
					badge: payload.badge,
					tag: payload.tag,
					data: { url: payload.url },
				}),
				syncAppBadge(),
			]);
		})(),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || "/inbox", self.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of windows) {
				if (client.url.startsWith(self.location.origin)) {
					await client.focus();
					await client.navigate(target);
					return;
				}
			}
			await self.clients.openWindow(target);
		})(),
	);
});

// Offline: the installed app opens to the mail it last loaded when there is no connection.
// - Hashed build assets are immutable, so they are served from cache first.
// - Pages and JSON API reads go to the network first and fall back to their last good copy when the
//   network fails or hangs. API copies live in one cache per account (named from a hash of the
//   bearer token), so switching accounts never shows another account's mail; reads without a bearer
//   token (cookie-only) are never saved. Logout and account switches delete copies
//   (src/lib/offline/cache-client.ts) and bump `generation`, so a request that started before the
//   clear cannot write its response back afterwards.
const STATIC_CACHE = "lab-static-v1";
const PAGES_CACHE = "lab-pages-v1";
const API_CACHE_PREFIX = "lab-api-v2-";
const NETWORK_TIMEOUT_MS = 4000;
const MAX_API_ENTRIES = 300;
let generation = 0;

self.addEventListener("message", (event) => {
	if (event.data?.type !== "lab-offline-clear") return;
	generation += 1;
	// The page waits for this before deleting caches, so no write can land between the two.
	event.ports[0]?.postMessage("cleared");
});

self.addEventListener("install", (event) => {
	// The offline page shows the app icon, so it must be saved before it is ever needed.
	event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.add("/icon-192.png")).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const current = [STATIC_CACHE, PAGES_CACHE];
			for (const key of await caches.keys()) {
				if (key.startsWith("lab-") && !current.includes(key) && !key.startsWith(API_CACHE_PREFIX)) await caches.delete(key);
			}
			await self.clients.claim();
		})(),
	);
});

async function apiCacheName(request) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("Authorization")));
	return API_CACHE_PREFIX + Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function trim(cache, max) {
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

// Network first; a cached copy answers when the network errors, or when it is slower than
// NETWORK_TIMEOUT_MS and a copy exists (a train tunnel should not spin forever).
async function networkFirst(request, cacheName, { cacheable, max, started, key = request }) {
	const cache = await caches.open(cacheName);
	const network = fetch(request).then(async (response) => {
		if (response.ok && cacheable(response) && started === generation) {
			await cache.put(key, response.clone());
			if (max) await trim(cache, max);
		}
		return response;
	});
	const cached = await cache.match(key);
	if (!cached) return network;
	const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
	return Promise.race([network.catch(() => cached), timeout]);
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || /\.(?:woff2|png|ico|svg|webmanifest)$/.test(url.pathname)) {
		event.respondWith(
			caches.open(STATIC_CACHE).then(async (cache) => {
				const cached = await cache.match(request);
				if (cached) return cached;
				const response = await fetch(request);
				if (response.ok) await cache.put(request, response.clone());
				return response;
			}),
		);
		return;
	}

	if (url.pathname.startsWith("/api/")) {
		// Only bearer-token reads can be tied to one account; cookie-only reads go straight to the network.
		if (url.pathname === "/api/realtime" || !request.headers.has("Authorization")) return;
		// Taken now, before any await, so a clear that lands while this request runs still wins.
		const started = generation;
		event.respondWith(
			apiCacheName(request).then((cacheName) =>
				networkFirst(request, cacheName, {
					started,
					cacheable: (response) => (response.headers.get("Content-Type") || "").includes("application/json"),
					max: MAX_API_ENTRIES,
				}).catch(() => Response.json({ error: "offline" }, { status: 503 })),
			),
		);
		return;
	}

	// Full page loads. RSC payloads (`*.rsc?_rsc=`) are keyed to router state, so they are left to the
	// network; offline, the router falls back to a full load, which lands here.
	if (request.mode === "navigate") {
		const started = generation;
		event.respondWith(
			networkFirst(request, PAGES_CACHE, {
				started,
				cacheable: (response) => response.type === "basic" && (response.headers.get("Content-Type") || "").includes("text/html"),
				max: 60,
			}).catch(() => offlinePage()),
		);
	}
});

function offlinePage() {
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>Offline</title><style>
:root{color-scheme:light dark;--bg:#fff;--fg:#14151a;--muted:#6b6f7a}@media (prefers-color-scheme:dark){:root{--bg:#121318;--fg:#f2f3f5;--muted:#9a9ea8}}
body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,sans-serif;padding:env(safe-area-inset-top) 24px env(safe-area-inset-bottom)}
main{max-width:20rem;text-align:center}img{width:56px;height:56px;border-radius:24%}h1{font-size:20px;font-weight:600;margin:20px 0 6px}p{margin:0 0 24px;color:var(--muted)}
a{display:inline-block;padding:12px 20px;border-radius:999px;background:var(--fg);color:var(--bg);text-decoration:none;font-weight:500}
</style></head><body><main><img src="/icon-192.png" alt=""><h1>You're offline</h1><p>This page hasn't been saved on this device yet. Mail you've already opened is still here.</p><a href="/inbox">Open inbox</a></main></body></html>`;
	return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
