import fsPromises from "node:fs/promises";
import nodePath from "node:path";

const { readFile } = fsPromises;
const { extname, join, resolve, sep } = nodePath;

/** A fixed-window limiter with the `RateLimit` binding's shape. */
export function openRateLimiter(
	limit: number,
	periodSeconds: number
): RateLimit {
	const windows = new Map<string, { count: number; resetAt: number }>();
	return {
		limit({ key }: { key: string }) {
			try {
				const now = Date.now();
				const current = windows.get(key);
				if (!current || current.resetAt <= now) {
					windows.set(key, { count: 1, resetAt: now + periodSeconds * 1000 });
					return Promise.resolve({ success: true });
				}
				current.count += 1;
				return Promise.resolve({ success: current.count <= limit });
			} catch (error) {
				return Promise.reject(error);
			}
		},
	} as unknown as RateLimit;
}

const CONTENT_TYPES: Record<string, string> = {
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain",
	".webp": "image/webp",
};

/** The `ASSETS` fetcher over the public directory. */
export function openAssets(publicDir: string): Fetcher {
	const root = resolve(publicDir);
	return {
		async fetch(input: RequestInfo | URL) {
			let href: string;
			if (typeof input === "string") {
				href = input;
			} else if (input instanceof URL) {
				({ href } = input);
			} else {
				({ url: href } = input);
			}
			const url = new URL(href);
			const path = resolve(join(root, url.pathname));
			if (path !== root && !path.startsWith(root + sep)) {
				return new Response("Not found", { status: 404 });
			}
			try {
				const body = await readFile(path);
				return new Response(body, {
					headers: {
						"Content-Type":
							CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
					},
				});
			} catch {
				return new Response("Not found", { status: 404 });
			}
		},
	} as unknown as Fetcher;
}
