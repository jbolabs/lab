// Copies the service worker (public/sw.js) keeps so the installed app opens offline. Saved pages can
// carry the signed-in name (the home page renders it on the server), so they go when the account
// changes; saved API reads are per account already and go at logout.
const PAGES_CACHE_PREFIX = "lab-pages-";
const API_CACHE_PREFIX = "lab-api-";

// Tell the worker first and wait for it, so a response already on its way is not saved into the emptied
// caches. Without a controlling worker nothing can be writing, and a silent one gets a short grace.
function invalidateWorkerWrites(): Promise<void> {
	const worker = navigator.serviceWorker?.controller;
	if (!worker) return Promise.resolve();
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		const timer = window.setTimeout(resolve, 500);
		channel.port1.onmessage = () => {
			window.clearTimeout(timer);
			resolve();
		};
		worker.postMessage({ type: "lab-offline-clear" }, [channel.port2]);
	});
}

async function deleteCaches(prefixes: string[]) {
	if (typeof window === "undefined" || !("caches" in window)) return;
	await invalidateWorkerWrites();
	const keys = await caches.keys();
	await Promise.all(keys.filter((key) => prefixes.some((prefix) => key.startsWith(prefix))).map((key) => caches.delete(key)));
}

export function clearOfflinePages(): Promise<void> {
	return deleteCaches([PAGES_CACHE_PREFIX]).catch(() => undefined);
}

export function clearOfflineCaches(): Promise<void> {
	return deleteCaches([PAGES_CACHE_PREFIX, API_CACHE_PREFIX]).catch(() => undefined);
}
