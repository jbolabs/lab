"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/language-provider";
import { runAsyncAction } from "@/lib/async-cleanup";
import type { TranslationKey } from "@/lib/i18n/types";

import { useAdminConfirmation } from "../admin-confirmation-provider";
import { requestJson } from "./api";
import ProviderCard from "./provider-card";
import ReceivingProviderConfig from "./receiving-provider-config";
import type { Domain, ReceivingProvider } from "./types";

type Option = Exclude<ReceivingProvider, "none">;
type Present = Record<Option, boolean | null>;

const OPTIONS: {
	id: Option;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
}[] = [
	{
		descriptionKey: "domains.opt.cfRoutingDesc",
		id: "cloudflare",
		titleKey: "domains.opt.cfRouting",
	},
	{
		descriptionKey: "domains.opt.resendReceiveDesc",
		id: "resend",
		titleKey: "domains.providerResend",
	},
	{
		descriptionKey: "domains.opt.sesReceiveDesc",
		id: "ses",
		titleKey: "domains.providerSes",
	},
];

interface Props {
	domain: Domain;
	onChange?: (provider: ReceivingProvider) => void;
	busy?: boolean;
	message?: string | null;
	/** Cloudflare routing status and setup, rendered by the parent that owns the DNS view. */
	cloudflareConfig: ReactNode;
	cloudflareOk: boolean;
}

export default function ReceivingSetupSection({
	domain,
	onChange,
	busy,
	message,
	cloudflareConfig,
	cloudflareOk,
}: Props) {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const [present, setPresent] = useState<Present>({
		cloudflare: null,
		resend: null,
		ses: null,
	});
	const [ready, setReady] = useState<Record<"resend" | "ses", boolean | null>>({
		resend: null,
		ses: null,
	});
	const [reload, setReload] = useState(0);
	const [removing, setRemoving] = useState<Option | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const data = await requestJson<Present>(
					`/api/domains/${domain.id}/receiving?refresh=${reload}&provider=${domain.receivingProvider}`,
					"GET"
				);
				if (active) {
					setPresent({
						cloudflare: data.cloudflare ?? null,
						resend: data.resend ?? null,
						ses: data.ses ?? null,
					});
				}
			},
			() => {
				if (active) {
					setPresent({ cloudflare: null, resend: null, ses: null });
				}
			}
		);
		return () => {
			active = false;
		};
	}, [domain.id, domain.receivingProvider, reload]);

	async function cleanUp(option: Option, title: string) {
		if (
			!(await confirm(
				t("domains.removeReceivingConfirm", { host: domain.hostname, title })
			))
		) {
			return;
		}
		setRemoving(option);
		setError("");
		return runAsyncAction(
			async () => {
				await requestJson(`/api/domains/${domain.id}/receiving`, "DELETE", {
					target: option,
				});
				setReload((value) => value + 1);
			},
			(error_) => {
				setError(
					error_ instanceof Error
						? error_.message
						: t("domains.removeConfigFailed")
				);
			},
			() => {
				setRemoving(null);
			}
		);
	}

	return (
		<section className="mt-6">
			<h2 className="text-base font-semibold text-foreground">
				{t("domains.setupReceiving")}
			</h2>
			<p className="mt-0.5 text-sm text-muted-foreground">
				{t("domains.setupReceivingDescription")}
			</p>
			<ul className="mt-3 flex flex-col gap-2">
				{OPTIONS.map((option) => {
					const selected = domain.receivingProvider === option.id;
					const ok = (() => {
						if (selected) {
							if (option.id === "cloudflare") {
								return cloudflareOk;
							}
							return ready[option.id];
						}
						return null;
					})();
					return (
						<ProviderCard
							key={option.id}
							title={t(option.titleKey)}
							description={t(option.descriptionKey)}
							ok={ok}
							selected={selected}
							disabled={busy}
							onToggle={(on) => onChange?.(on ? option.id : "none")}
							cleanup={{
								busy: removing === option.id,
								disabled: removing !== null,
								onClick: () => cleanUp(option.id, t(option.titleKey)),
								present: !!present[option.id],
							}}
						>
							{option.id === "cloudflare" ? (
								cloudflareConfig
							) : (
								<ReceivingProviderConfig
									domainId={domain.id}
									provider={option.id}
									onReady={(value) =>
										setReady((current) =>
											current[option.id as "resend" | "ses"] === value
												? current
												: { ...current, [option.id]: value }
										)
									}
								/>
							)}
						</ProviderCard>
					);
				})}
			</ul>
			{domain.receivingProvider === "none" && (
				<p className="mt-2 text-xs text-muted-foreground">
					{t("domains.noReceiving")}
				</p>
			)}
			{message && (
				<p role="alert" className="mt-2 text-xs text-destructive">
					{message}
				</p>
			)}
			{error && (
				<p role="alert" className="mt-2 text-xs text-destructive">
					{error}
				</p>
			)}
		</section>
	);
}
