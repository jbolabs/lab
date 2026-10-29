import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
