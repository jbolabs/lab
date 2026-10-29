import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import CloudflareReceivingConfig from "./cloudflare-receiving-config";
import { DnsValue } from "./dns-value";
import ReceivingSetupSection from "./receiving-setup-section";
import SendingSetupSection from "./sending-setup-section";
import { ROW_GRID, StatusBadge, StatusRow } from "./status-row";
import type { DnsAuthRecord, DomainDnsDetailsProps } from "./types";
import { dnsAuthDescriptions } from "./utils";

export default function DomainDnsDetails({
	domain,
	dns,
	onSetup,
	setupRecord,
	setupMessage,
	onSendingProviderChange,
	sendingProviderBusy,
	sendingProviderMessage,
	onReceivingProviderChange,
	receivingProviderBusy,
	receivingProviderMessage,
	onDnsChanged,
}: DomainDnsDetailsProps) {
	const { t } = useLanguage();
	const { audit } = dns;
	const manual = domain.zoneId === "manual" && !domain.dnsSkipped;
	const subdomain = dns.sendingSubdomain;
	const sendingOk = subdomain
		? dns.sendingEnabled
		: manual && domain.sendingEnabled;
	const sendingLabel = (() => {
		if (subdomain) {
			return t("domains.sendingFor", {
				name: subdomain.name,
				state: dns.sendingEnabled
					? t("domains.enabled")
					: t("domains.disabled"),
			});
		}
		if (manual) {
			if (domain.sendingEnabled) {
				return t("domains.sendingConfigured");
			}
			return t("domains.sendingNotConfigured");
		}
		return t("domains.sendingNotSet");
	})();
	const routingOk =
		dns.routing.missing.length === 0 &&
		(dns.routing.records.length > 0 || domain.routingEnabled);
	const routingLabel = (() => {
		if (routingOk) {
			return t("domains.routingConfigured");
		}
		if (dns.routing.missing.length > 0) {
			return t("domains.recordsMissing", { count: dns.routing.missing.length });
		}
		return t("domains.noRoutingRecords");
	})();

	const auditRow = (record: DnsAuthRecord) => {
		if (!audit) {
			return null;
		}
		const item = audit[record];
		const ok = item.status === "ok";
		return (
			<li key={record} className={`${ROW_GRID} border bg-card`}>
				<StatusBadge
					ok={ok}
					tone={item.status === "missing" ? "red" : "neutral"}
				/>
				<span className="min-w-0">
					<span className="block font-medium text-foreground">
						{t("domains.recordLabel", { label: item.label })}
					</span>
					<span className="block text-xs text-muted-foreground">
						{t(dnsAuthDescriptions[record])}
					</span>
				</span>
				{ok ? (
					<DnsValue
						value={item.found.length > 0 ? item.found.join(", ") : item.name}
					/>
				) : (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						disabled={manual || setupRecord === record}
						title={
							manual
								? t("domains.manualDns")
								: t("domains.createRecord", { label: item.label })
						}
						onClick={() => onSetup?.(record)}
					>
						{setupRecord === record
							? t("domains.settingUp")
							: t("domains.setup")}
					</Button>
				)}
			</li>
		);
	};

	const cloudflareConfig = (
		<ul className="flex flex-col gap-2">
			<StatusRow
				ok={!!sendingOk}
				title={t("domains.emailSending")}
				hint={t("domains.emailSendingHint")}
			>
				{sendingLabel}
			</StatusRow>
			{auditRow("dkim")}
		</ul>
	);

	const cloudflareReceiving = (
		<CloudflareReceivingConfig
			domainId={domain.id}
			routingOk={routingOk}
			routingLabel={routingLabel}
			manual={manual}
			onChanged={onDnsChanged}
		/>
	);

	return (
		<div className="px-4 pt-4 pb-4 sm:px-5 sm:pb-5">
			{audit && (
				<section>
					<h2 className="text-base font-semibold text-foreground">
						{t("domains.setupTitle")}
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						{t("domains.setupDescription")}
					</p>
					<ul className="mt-3 flex flex-col gap-2">
						{(["mx", "spf", "dmarc"] as DnsAuthRecord[]).map(auditRow)}
					</ul>
					{manual && (
						<Alert>
							<AlertDescription>{t("domains.manualDnsNote")}</AlertDescription>
						</Alert>
					)}
					{setupMessage && (
						<p role="alert" className="text-xs text-destructive">
							{setupMessage}
						</p>
					)}
				</section>
			)}
			<ReceivingSetupSection
				domain={domain}
				onChange={onReceivingProviderChange}
				busy={receivingProviderBusy}
				message={receivingProviderMessage}
				cloudflareConfig={cloudflareReceiving}
				cloudflareOk={routingOk}
			/>
			<SendingSetupSection
				domain={domain}
				onChange={onSendingProviderChange}
				busy={sendingProviderBusy}
				message={sendingProviderMessage}
				cloudflareConfig={cloudflareConfig}
				cloudflareOk={!!sendingOk && audit?.dkim.status === "ok"}
			/>
		</div>
	);
}
