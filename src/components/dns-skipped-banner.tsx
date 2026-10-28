"use client";

import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/auth/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

type SkippedDomain = { id: string; hostname: string; dnsSkipped?: boolean };

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
			if (!res.ok) return;
			const data = (await res.json()) as { domains?: SkippedDomain[] };
			setDomains((data.domains ?? []).filter((domain) => domain.dnsSkipped));
		} catch {
			// The banner is advisory; a failed read just hides it.
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	if (domains.length === 0) return null;
	const canManage =
		!!user &&
		(user.isPrimaryAdmin || (user.role === "admin" && user.canManageDomains));

	async function markDone() {
		setBusy(true);
		try {
			await Promise.all(
				domains.map((domain) =>
					authFetch(`/api/domains/${domain.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ dnsSkipped: false }),
					}),
				),
			);
		} finally {
			setBusy(false);
			await load();
		}
	}

	return (
		<Alert role="status" className="mb-2">
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
							className="max-md:min-h-11"
							disabled={busy}
							onClick={() => void markDone()}
						>
							{t("dnsSkipped.markDone")}
						</Button>
					</div>
				)}
			</AlertDescription>
		</Alert>
	);
}
