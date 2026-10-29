"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/language-provider";
import { runAsyncAction } from "@/lib/async-cleanup";
import type { TranslationKey } from "@/lib/i18n/types";

import { useAdminConfirmation } from "../admin-confirmation-provider";
import { requestJson } from "./api";
import ProviderCard from "./provider-card";
import ResendDomainSection from "./resend-domain-section";
import SesSendingConfig from "./ses-sending-config";
import type { Domain, SendingProvider } from "./types";

type Option = Exclude<SendingProvider, "none">;
type Present = Record<Option, boolean | null>;

const OPTIONS: {
	id: Option;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
}[] = [
	{
		descriptionKey: "domains.opt.cfSendDesc",
		id: "cloudflare",
		titleKey: "domains.opt.cfEmail",
	},
	{
		descriptionKey: "domains.opt.resendSendDesc",
		id: "resend",
		titleKey: "domains.providerResend",
	},
	{
		descriptionKey: "domains.opt.sesSendDesc",
		id: "ses",
		titleKey: "domains.providerSes",
	},
];

interface Props {
	domain: Domain;
	onChange?: (provider: SendingProvider) => void;
	busy?: boolean;
	message?: string | null;
	/** Config UI for Cloudflare sending, rendered by the parent which owns the DNS audit. */
	cloudflareConfig: ReactNode;
	/** Whether Cloudflare sending is fully set up (subdomain enabled, DKIM present). */
	cloudflareOk: boolean;
}

type PresenceResponse = Partial<Present> & {
	resendStatus?: string | null;
	sesVerified?: boolean | null;
};

export default function SendingSetupSection({
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
	const [resendStatus, setResendStatus] = useState<string | null>(null);
	const [sesStatus, setSesStatus] = useState<string | null>(null);
	const [reload, setReload] = useState(0);
	const [removing, setRemoving] = useState<Option | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const data = await requestJson<PresenceResponse>(
					`/api/domains/${domain.id}/sending?refresh=${reload}&provider=${domain.sendingProvider}`,
					"GET"
				);
				if (!active) {
					return;
				}
				setPresent({
					cloudflare: data.cloudflare ?? null,
					resend: data.resend ?? null,
					ses: data.ses ?? null,
				});
				setResendStatus(data.resendStatus ?? null);
				setSesStatus(
					(() => {
						if (data.sesVerified === null || data.sesVerified === undefined) {
							return null;
						}
						if (data.sesVerified) {
							return "verified";
						}
						return "pending";
					})()
				);
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
	}, [domain.id, domain.sendingProvider, reload]);

	async function cleanUp(option: Option, title: string) {
		if (
			!(await confirm(
				t("domains.removeSendingConfirm", { host: domain.hostname, title })
			))
		) {
			return;
		}
		setRemoving(option);
		setError("");
		return runAsyncAction(
			async () => {
				await requestJson(`/api/domains/${domain.id}/sending`, "DELETE", {
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

	// true/false when we know whether the option is set up, null when we cannot tell.
	const okFor = (option: Option): boolean | null =>
		(() => {
			if (option === "cloudflare") {
				return cloudflareOk;
			}
			if (option === "resend") {
				if (resendStatus === null) {
					return null;
				}
				return resendStatus === "verified";
			}
			if (sesStatus === null) {
				return null;
			}
			return sesStatus === "verified";
		})();

	return (
		<section className="mt-6">
			<h2 className="text-base font-semibold text-foreground">
				{t("domains.setupSending")}
			</h2>
			<p className="mt-0.5 text-sm text-muted-foreground">
				{domain.sendingProvider === "none"
					? t("domains.sendingNone")
					: t("domains.sendingChoose")}
			</p>
			<ul className="mt-3 flex flex-col gap-2">
				{OPTIONS.map((option) => {
					const selected = domain.sendingProvider === option.id;
					return (
						<ProviderCard
							key={option.id}
							title={t(option.titleKey)}
							description={t(option.descriptionKey)}
							ok={selected || present[option.id] ? okFor(option.id) : null}
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
							{(() => {
								if (option.id === "cloudflare") {
									return cloudflareConfig;
								}
								if (option.id === "resend") {
									return (
										<ResendDomainSection
											domainId={domain.id}
											onStatus={setResendStatus}
										/>
									);
								}
								return (
									<SesSendingConfig
										domainId={domain.id}
										onStatus={setSesStatus}
									/>
								);
							})()}
						</ProviderCard>
					);
				})}
			</ul>
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
