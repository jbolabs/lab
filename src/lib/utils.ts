import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom `--ease-*` tokens from the @theme in globals.css. tailwind-merge only knows the default
// easings, so without this `cn("ease-in-out", "ease-drawer")` keeps both and CSS order picks
// `ease-in-out`. tests/tailwind-merge-theme.test.mjs fails when a token is missing here.
const CUSTOM_EASINGS = ["drawer", "out-expo"];

const twMerge = extendTailwindMerge({
	extend: { theme: { ease: CUSTOM_EASINGS } },
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replaceAll(/[^a-z0-9]+/gu, "-")
		.replaceAll(/^-+|-+$/gu, "");
}

export function parseAddress(
	address: string
): { local: string; domain: string } | null {
	const normalized =
		address.trim().match(/<(?<capture1>[^>]+)>$/u)?.[1] ?? address.trim();
	const match = normalized.match(
		/^(?<capture1>[^@\s]+)@(?<capture2>[^@\s]+)$/u
	);
	if (!match) {
		return null;
	}
	return { domain: match[2].toLowerCase(), local: match[1].toLowerCase() };
}
