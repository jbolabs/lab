"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

interface SkippedDomain {
	id: string;
	hostname: string;
	dnsSkipped?: boolean;
}

export function DnsSkippedBanner() {
	const { t } = useLanguage();
	const user = useCurrentUser();
	const [domains, setDomains] = useState<SkippedDomain[]>([]);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			const res = await authFetch("/api/domains", {
				redirectOnUnauthorized: false,
			});
			if (!res.ok) {
				return;
			}
			const data = (await res.json()) as { domains?: SkippedDomain[] };
			setDomains((data.domains ?? []).filter((domain) => domain.dnsSkipped));
		} catch {
			// The banner is advisory; a failed read just hides it.
		}
	}, []);

	useEffect(() => {
		let active = true;
		async function readDomains() {
			try {
				const response = await authFetch("/api/domains", {
					redirectOnUnauthorized: false,
				});
				if (!response.ok) {
					return;
				}
				const data = (await response.json()) as { domains?: SkippedDomain[] };
				if (active) {
					setDomains(
						(data.domains ?? []).filter((domain) => domain.dnsSkipped)
					);
				}
			} catch {
				// Advisory banner stays hidden on read failure.
			}
		}
		void readDomains();
		return () => {
			active = false;
		};
	}, []);

	if (domains.length === 0) {
		return null;
	}
	const canManage =
		!!user &&
		(user.isPrimaryAdmin || (user.role === "admin" && user.canManageDomains));

	async function markDone() {
		setBusy(true);
		return await withCleanup(
			async () => {
				await Promise.all(
					domains.map((domain) =>
						authFetch(`/api/domains/${domain.id}`, {
							body: JSON.stringify({ dnsSkipped: false }),
							headers: { "Content-Type": "application/json" },
							method: "PATCH",
						})
					)
				);
			},
			async () => {
				setBusy(false);
				await load();
			}
		);
	}

	return (
		<Alert aria-live="polite" className="mb-2">
			<AlertTriangle className="h-4 w-4 shrink-0" />
			<AlertDescription>
				{t("dnsSkipped.warning", {
					domains: domains.map((domain) => domain.hostname).join(", "),
				})}
				{canManage && (
					<div className="flex flex-wrap items-center gap-3">
						<Link
							href="/domains"
							className="font-semibold underline underline-offset-2"
						>
							{t("dnsSkipped.review")}
						</Link>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => markDone()}
						>
							{t("dnsSkipped.markDone")}
						</Button>
					</div>
				)}
			</AlertDescription>
		</Alert>
	);
}
