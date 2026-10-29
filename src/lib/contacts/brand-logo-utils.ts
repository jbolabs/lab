import { normalizeEmailAddress } from "@/lib/email/address";

// Personal mail providers: their logo says nothing about the sender, so these show initials.
const PERSONAL_MAIL_DOMAINS = new Set([
	"126.com",
	"163.com",
	"aim.com",
	"aol.com",
	"att.net",
	"comcast.net",
	"duck.com",
	"fastmail.com",
	"fastmail.fm",
	"gmail.com",
	"gmx.com",
	"gmx.de",
	"gmx.net",
	"googlemail.com",
	"hey.com",
	"hotmail.co.uk",
	"hotmail.com",
	"hotmail.fr",
	"icloud.com",
	"live.com",
	"mac.com",
	"mail.com",
	"mail.ru",
	"me.com",
	"msn.com",
	"outlook.com",
	"passmail.net",
	"pm.me",
	"privaterelay.appleid.com",
	"proton.me",
	"protonmail.com",
	"qq.com",
	"sbcglobal.net",
	"simplelogin.com",
	"t-online.de",
	"tuta.io",
	"tutanota.com",
	"verizon.net",
	"web.de",
	"yahoo.co.uk",
	"yahoo.com",
	"yahoo.fr",
	"yandex.com",
	"yandex.ru",
	"ymail.com",
	"zoho.com",
]);

// Second-level labels under a country code that are registries, not organisations (co.uk, com.au).
const REGISTRY_SECOND_LEVELS = new Set([
	"ac",
	"co",
	"com",
	"edu",
	"gov",
	"ltd",
	"ne",
	"net",
	"or",
	"org",
	"plc",
]);

const HOSTNAME_PATTERN =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

export const BRAND_LOGO_ROUTE = "/api/contacts/brand-logo";

export function isBrandLogoHostname(value: string): boolean {
	return HOSTNAME_PATTERN.test(value);
}

/** The registrable domain, e.g. `mail.paypal.co.uk` → `paypal.co.uk`. */
export function getOrganizationalDomain(hostname: string): string {
	const labels = hostname.split(".");
	if (labels.length <= 2) {
		return hostname;
	}
	const secondLevel = labels.at(-2) ?? "";
	const topLevel = labels.at(-1) ?? "";
	const keep =
		topLevel.length === 2 && REGISTRY_SECOND_LEVELS.has(secondLevel) ? 3 : 2;
	return labels.slice(-keep).join(".");
}

/** The sender's domain when it belongs to an organisation that may publish a logo. */
export function getBrandLogoDomain(address: string): string | null {
	const email = normalizeEmailAddress(address);
	const domain = email.slice(email.lastIndexOf("@") + 1);
	if (!email.includes("@") || !isBrandLogoHostname(domain)) {
		return null;
	}
	const labels = domain.split(".");
	if (
		labels.some((_, index) =>
			PERSONAL_MAIL_DOMAINS.has(labels.slice(index).join("."))
		)
	) {
		return null;
	}
	return domain;
}

export function getBrandLogoUrl(address: string): string | null {
	const domain = getBrandLogoDomain(address);
	return domain
		? `${BRAND_LOGO_ROUTE}?${new URLSearchParams({ domain }).toString()}`
		: null;
}

/** The `l=` logo URL of a BIMI record, if the record is valid and names an HTTPS logo. */
export function parseBimiLogoUrl(record: string): string | null {
	const tags = new Map<string, string>();
	for (const part of record.split(";")) {
		const separator = part.indexOf("=");
		if (separator > 0) {
			tags.set(
				part.slice(0, separator).trim().toLowerCase(),
				part.slice(separator + 1).trim()
			);
		}
	}
	if (tags.get("v") !== "BIMI1") {
		return null;
	}
	const location = tags.get("l");
	if (!location) {
		return null;
	}
	try {
		const url = new URL(location);
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

/** Pixel width of a PNG from its IHDR chunk, or null for anything else. */
export function getPngWidth(bytes: Uint8Array): number | null {
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (
		bytes.length < 24 ||
		signature.some((byte, index) => bytes[index] !== byte)
	) {
		return null;
	}
	return new DataView(bytes.buffer, bytes.byteOffset).getUint32(16);
}
