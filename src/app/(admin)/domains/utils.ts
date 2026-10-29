import { authFetch } from "@/lib/auth/client";
import type { TranslationKey } from "@/lib/i18n/types";
import { defaultTranslator } from "@/lib/i18n/utils";
import type { Translator } from "@/lib/i18n/utils";

import type {
	DnsAuthRecord,
	DnsAuthStatus,
	DomainPreflightResponse,
} from "./types";

export const dnsAuthRecords: DnsAuthRecord[] = ["mx", "spf", "dkim", "dmarc"];

export const dnsAuthDescriptions = {
	dkim: "dns.dkim",
	dmarc: "dns.dmarc",
	mx: "dns.mx",
	spf: "dns.spf",
} satisfies Record<DnsAuthRecord, TranslationKey>;

export function getDnsAuthStatusLabel(
	status: DnsAuthStatus,
	t: Translator = defaultTranslator
): string {
	switch (status) {
		case "ok": {
			return t("dns.found");
		}
		case "missing": {
			return t("dns.missing");
		}
		default: {
			return t("dns.notVerified");
		}
	}
}

export function getDnsAuthBadgeVariant(
	status: DnsAuthStatus
): "success" | "destructive-soft" | "secondary" {
	switch (status) {
		case "ok": {
			return "success";
		}
		case "missing": {
			return "destructive-soft";
		}
		default: {
			return "secondary";
		}
	}
}

export async function checkDomain(
	hostname: string
): Promise<DomainPreflightResponse> {
	const response = await authFetch("/api/domains/check", {
		body: JSON.stringify({ hostname }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as Omit<DomainPreflightResponse, "ok">;
	return { ok: response.ok, ...data };
}
