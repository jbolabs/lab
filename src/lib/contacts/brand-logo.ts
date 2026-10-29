import {
	getOrganizationalDomain,
	getPngWidth,
	parseBimiLogoUrl,
} from "./brand-logo-utils";

interface BrandLogo {
	contentType: string;
	bytes: Uint8Array<ArrayBuffer>;
}

interface StoredBrandLogo {
	fetchedAt: number;
	logo: { contentType: string; data: string } | null;
	retryAfter: number;
}

const DAY = 24 * 60 * 60 * 1000;
const FOUND_TTL = 30 * DAY;
const MISSING_TTL = 7 * DAY;
const FAILED_TTL = DAY;
const FETCH_TIMEOUT = 4000;
const MAX_LOGO_SIZE = 64 * 1024;
const IMAGE_TYPES = new Set([
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/x-icon",
	"image/vnd.microsoft.icon",
]);

function brandLogoKeyFor(domain: string): string {
	return `brand-logos/${domain}.json`;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x80_00) {
		binary += String.fromCodePoint(...bytes.subarray(index, index + 0x80_00));
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0);
}

function getContentType(response: Response): string {
	return (
		response.headers
			.get("Content-Type")
			?.split(";", 1)[0]
			?.trim()
			.toLowerCase() ?? ""
	);
}

async function fetchImage(
	url: string,
	accept: (contentType: string) => boolean
): Promise<BrandLogo | null> {
	const response = await fetch(url, {
		headers: { Accept: "image/*" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT),
	});
	const contentType = getContentType(response);
	if (!response.ok || !accept(contentType)) {
		return null;
	}
	if (Number(response.headers.get("Content-Length") ?? 0) > MAX_LOGO_SIZE) {
		return null;
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (!bytes.length || bytes.length > MAX_LOGO_SIZE) {
		return null;
	}
	return { bytes, contentType };
}

async function lookupBimiRecord(domain: string): Promise<string | null> {
	const params = new URLSearchParams({
		name: `default._bimi.${domain}`,
		type: "TXT",
	});
	const response = await fetch(
		`https://cloudflare-dns.com/dns-query?${params}`,
		{
			headers: { Accept: "application/dns-json" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT),
		}
	);
	if (!response.ok) {
		throw new Error(`DNS lookup failed with ${response.status}`);
	}
	const result = (await response.json()) as {
		Answer?: { type: number; data: string }[];
	};
	for (const answer of result.Answer ?? []) {
		if (answer.type !== 16) {
			continue;
		}
		// Long TXT records arrive as several quoted strings.
		const record = answer.data
			.replaceAll(/"\s*"/gu, "")
			.replaceAll(/^"|"$/gu, "");
		if (record.startsWith("v=BIMI1")) {
			return record;
		}
	}
	return null;
}

/**
 * Serves a third-party image only as a data URI inside our own SVG. An SVG
 * loaded through <image> cannot run script, so a hostile logo stays inert
 * even when the URL is opened directly and the route's CSP is dropped, as
 * Next does on the Node runtime.
 */
function wrapInSvg(logo: BrandLogo, inset: number): BrandLogo {
	const size = 100 - inset * 2;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><image href="data:${logo.contentType};base64,${toBase64(logo.bytes)}" x="${inset}" y="${inset}" width="${size}" height="${size}"/></svg>`;
	return {
		bytes: new TextEncoder().encode(svg),
		contentType: "image/svg+xml",
	};
}

/** BIMI logos are the square SVG marks Gmail and Apple Mail show for verified senders. */
async function fetchBimiLogo(domain: string): Promise<BrandLogo | null> {
	const record = await lookupBimiRecord(domain);
	const location = record ? parseBimiLogoUrl(record) : null;
	if (!location) {
		return null;
	}
	return fetchImage(
		location,
		(type) =>
			type === "image/svg+xml" ||
			type === "text/xml" ||
			type === "application/xml"
	).then(
		(logo) => logo && wrapInSvg({ ...logo, contentType: "image/svg+xml" }, 0)
	);
}

/** A site's touch icon is a full-bleed square made to be shown rounded, so it fills the avatar. */
async function fetchTouchIcon(domain: string): Promise<BrandLogo | null> {
	const logo = await fetchImage(
		`https://${domain}/apple-touch-icon.png`,
		(type) => type === "image/png"
	);
	return logo && (getPngWidth(logo.bytes) ?? 0) >= 96 ? logo : null;
}

/** Favicons have transparent edges, so they sit inset on a white disc rather than filling it. */
async function fetchFavicon(domain: string): Promise<BrandLogo | null> {
	const params = new URLSearchParams({ domain, sz: "128" });
	const logo = await fetchImage(
		`https://www.google.com/s2/favicons?${params}`,
		(type) => IMAGE_TYPES.has(type)
	);
	if (!logo) {
		return null;
	}
	const width = getPngWidth(logo.bytes);
	if (width !== null && width < 32) {
		return null;
	}
	return wrapInSvg(logo, 22);
}

async function findBrandLogo(
	domain: string
): Promise<{ logo: BrandLogo | null; failed: boolean }> {
	const organization = getOrganizationalDomain(domain);
	const steps = [
		() => fetchBimiLogo(domain),
		...(organization === domain ? [] : [() => fetchBimiLogo(organization)]),
		() => fetchTouchIcon(organization),
		() => fetchFavicon(organization),
	];
	let failed = false;
	for (const step of steps) {
		try {
			const logo = await step();
			if (logo) {
				return { failed, logo };
			}
		} catch {
			failed = true;
		}
	}
	return { failed, logo: null };
}

/** The sender domain's logo, looked up once and kept in the bucket so senders never see who reads their mail. */
export async function getBrandLogo(
	env: CloudflareEnv,
	domain: string
): Promise<BrandLogo | null> {
	const key = brandLogoKeyFor(domain);
	const cached = await env.BUCKET.get(key);
	if (cached) {
		try {
			const stored = (await cached.json()) as StoredBrandLogo;
			if (stored.retryAfter > Date.now()) {
				return stored.logo
					? {
							bytes: fromBase64(stored.logo.data),
							contentType: stored.logo.contentType,
						}
					: null;
			}
		} catch {
			// A damaged record is looked up again.
		}
	}

	const { logo, failed } = await findBrandLogo(domain);
	const now = Date.now();
	let ttl = logo ? FOUND_TTL : MISSING_TTL;
	if (!logo && failed) {
		ttl = FAILED_TTL;
	}
	const stored: StoredBrandLogo = {
		fetchedAt: now,
		logo: logo && { contentType: logo.contentType, data: toBase64(logo.bytes) },
		retryAfter: now + ttl,
	};
	await env.BUCKET.put(key, JSON.stringify(stored), {
		httpMetadata: { contentType: "application/json" },
	});
	return logo;
}
