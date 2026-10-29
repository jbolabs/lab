"use client";
import { useAdminConfirmation } from "../admin-confirmation-provider";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { runReceivingSetup } from "./api";
import { StatusRow } from "./status-row";

type Props = {
	domainId: string;
	routingOk: boolean;
	routingLabel: string;
	manual: boolean;
	onChanged?: () => void;
};

/** Email Routing status for the zone, with a setup that also deals with conflicting MX records. */
export default function CloudflareReceivingConfig({ domainId, routingOk, routingLabel, manual, onChanged }: Props) {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function setup() {
		setBusy(true);
		setError("");
		try {
			if (await runReceivingSetup(domainId, "cloudflare", confirm)) onChanged?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("domains.setupFailed"));
		} finally { setBusy(false); }
	}

	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col gap-2">
				<StatusRow
					ok={routingOk}
					title={t("domains.emailRouting")}
					hint={t("domains.emailRoutingHint")}
					action={!routingOk ? (
						<Button size="sm" variant="outline" className="bg-card" disabled={busy || manual} title={manual ? t("domains.manualDns") : undefined} onClick={() => void setup()}>
							{busy ? t("domains.settingUp") : t("domains.setup")}
						</Button>
					) : undefined}
				>
					{routingLabel}
				</StatusRow>
			</ul>
			{error && <p role="alert" className="text-xs text-red-600">{error}</p>}
		</div>
	);
}
