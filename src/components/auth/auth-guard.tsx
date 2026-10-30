"use client";

import { useEffect, useState } from "react";

import { LoadingTransition } from "@/components/loading-transition";
import { authFetch } from "@/lib/auth/client";
import { usePathname, useRouter } from "@/lib/navigation";
import { saveUserTimeZonePreference } from "@/lib/time/client";

import type { AuthGuardProps } from "./auth-guard-types";

interface SessionData {
	hasMailboxes?: boolean;
	isSetup?: boolean;
	user?: {
		id?: string;
		role?: string;
		isPrimaryAdmin?: boolean;
		timeZone?: string | null;
	};
}

function sessionDestination(
	data: SessionData,
	pathname: string,
	requirements: Pick<
		AuthGuardProps,
		"requireMailbox" | "requireRole" | "requirePrimary"
	>
): string | null {
	if (
		requirements.requireMailbox &&
		data.hasMailboxes === false &&
		data.user?.role === "admin" &&
		data.isSetup === false &&
		pathname !== "/setup"
	) {
		return "/setup";
	}
	if (pathname === "/setup" && data.isSetup === true) {
		return "/inbox";
	}
	if (
		requirements.requireRole &&
		data.user?.role !== requirements.requireRole
	) {
		return "/inbox";
	}
	if (requirements.requirePrimary && !data.user?.isPrimaryAdmin) {
		return "/admin";
	}
	return null;
}

export function AuthGuard({
	children,
	mode = "protected",
	requireMailbox,
	requireRole,
	requirePrimary,
	allowAuthenticated,
}: AuthGuardProps) {
	const pathname = usePathname();
	const router = useRouter();
	const [authorized, setAuthorized] = useState(mode === "public");

	useEffect(() => {
		let cancelled = false;

		async function checkSession() {
			try {
				const cookieResponse = await fetch("/api/auth/me", {
					cache: "no-store",
					signal: AbortSignal.timeout(5000),
				});
				const response =
					cookieResponse.ok || cookieResponse.status !== 401
						? cookieResponse
						: await authFetch("/api/auth/me", {
								redirectOnUnauthorized: false,
								signal: AbortSignal.timeout(5000),
							});
				if (cancelled) {
					return;
				}

				if (!response.ok) {
					if (mode === "protected" && response.status === 401) {
						router.replace("/login");
					} else {
						setAuthorized(true);
					}
					return;
				}

				const data = (await response.json()) as SessionData;
				if (data.user?.id) {
					saveUserTimeZonePreference(data.user.id, data.user.timeZone ?? null);
				}
				if (mode === "public") {
					if (!allowAuthenticated) {
						router.replace("/inbox");
					}
					return;
				}

				const destination = sessionDestination(data, pathname, {
					requireMailbox,
					requirePrimary,
					requireRole,
				});
				if (destination) {
					router.replace(destination);
					return;
				}

				setAuthorized(true);
			} catch {
				if (!cancelled) {
					setAuthorized(true);
				}
			}
		}

		checkSession();

		return () => {
			cancelled = true;
		};
	}, [
		mode,
		pathname,
		requireMailbox,
		requireRole,
		requirePrimary,
		allowAuthenticated,
		router,
	]);

	useEffect(() => {
		const refreshTimeZone = (event: StorageEvent) => {
			if (event.key === "mailflare-user-time-zone") {
				window.location.reload();
			}
		};
		window.addEventListener("storage", refreshTimeZone);
		return () => window.removeEventListener("storage", refreshTimeZone);
	}, []);

	if (mode === "public") {
		return children;
	}
	return <LoadingTransition ready={authorized}>{children}</LoadingTransition>;
}
