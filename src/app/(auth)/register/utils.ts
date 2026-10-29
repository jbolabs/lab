import { clearClientSessionToken } from "@/lib/auth/client";

import type {
	DomainSetupResult,
	MxCheckResult,
	RegisterResult,
	SetupPreparationResult,
	SetupStatus,
} from "./types";

export async function prepareSetup(): Promise<{
	ok: boolean;
	data: SetupPreparationResult;
}> {
	const res = await fetch("/api/setup/prepare", { method: "POST" });
	return {
		data: (await res.json()) as SetupPreparationResult,
		ok: res.ok,
	};
}

export async function getSetupStatus(): Promise<SetupStatus> {
	const res = await fetch("/api/setup/status");
	const data = (await res.json()) as SetupStatus;
	if (!res.ok) {
		throw new Error(data.error ?? "Could not load setup status");
	}
	return data;
}

export async function submitPrimaryDomain(
	hostname: string
): Promise<{ ok: boolean; data: DomainSetupResult }> {
	const res = await fetch("/api/setup/domain", {
		body: JSON.stringify({ hostname }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	return {
		data: (await res.json()) as DomainSetupResult,
		ok: res.ok,
	};
}

export async function checkExistingMx(
	hostname: string
): Promise<{ ok: boolean; data: MxCheckResult }> {
	const res = await fetch("/api/setup/domain/mx", {
		body: JSON.stringify({ hostname }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	return {
		data: (await res.json()) as MxCheckResult,
		ok: res.ok,
	};
}

export async function submitRegistration(
	form: FormData,
	payload: {
		firstRun: boolean;
		domain: string;
		enableSending?: boolean;
		replaceMxRecords?: boolean;
		skipDns?: boolean;
	}
): Promise<{ ok: boolean; data: RegisterResult }> {
	const res = await fetch("/api/auth/register", {
		body: JSON.stringify(
			payload.firstRun
				? {
						domain: payload.domain,
						enableSending: payload.enableSending,
						password: form.get("password"),
						replaceMxRecords: payload.replaceMxRecords,
						resetEmail: form.get("resetEmail"),
						skipDns: payload.skipDns,
						turnstileToken: form.get("turnstileToken"),
						username: form.get("username"),
					}
				: {
						password: form.get("password"),
						resetEmail: form.get("resetEmail"),
						turnstileToken: form.get("turnstileToken"),
						username: form.get("username"),
					}
		),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	const data = (await res.json()) as RegisterResult;
	if (res.ok) {
		clearClientSessionToken();
	}
	return { data, ok: res.ok };
}
