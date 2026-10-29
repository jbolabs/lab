import {
	Check,
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Globe2,
} from "lucide-react";
import Image from "next/image";
import { Fragment } from "react";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item as ListRow } from "@/components/ui/item";
import { cn } from "@/lib/utils";

import { AdminRowActions } from "../admin-row-actions";
import DomainDnsDetails from "./domain-dns-details";
import DomainDnsSkeleton from "./domain-dns-skeleton";
import type { DomainItemCardProps } from "./types";
import { dnsAuthRecords, getDnsAuthStatusLabel } from "./utils";

function StatusIcon({ ok, className }: { ok: boolean; className?: string }) {
	if (ok) {
		return <Check className={cn(className, "text-foreground")} />;
	}
	return <AlertTriangle className={cn(className, "text-warning")} />;
}

export default function DomainItemCard({
	item,
	dns,
	dnsDetails,
	onSendingProviderChange,
	sendingProviderBusy,
	sendingProviderMessage,
	onReceivingProviderChange,
	receivingProviderBusy,
	receivingProviderMessage,
	onDnsChanged,
	dnsLoading = false,
	dnsError,
	expanded = false,
	remove,
	onToggleDns,
	onSetup,
	setupRecord,
	setupMessage,
}: DomainItemCardProps) {
	const { t } = useLanguage();
	const auth = dns?.auth;

	return (
		<ListRow
			variant="outline"
			className="group relative flex-col items-stretch"
		>
			<div className="flex flex-col items-start gap-3 md:flex-row md:gap-4">
				<span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
					<Globe2 className="size-5" />
					<Image
						unoptimized
						width={48}
						height={48}
						src={`https://${item.hostname}/favicon.ico`}
						alt=""
						className="absolute inset-0 size-full object-contain p-1"
						onError={(event) => event.currentTarget.remove()}
					/>
				</span>

				<div className="flex w-full min-w-0 flex-1 flex-col gap-2">
					<span className="min-w-0 truncate pr-10 text-sm font-semibold text-foreground">
						{item.hostname}
					</span>

					<div className="flex flex-wrap gap-2">
						<Badge variant={item.status === "active" ? "outline" : "secondary"}>
							<StatusIcon ok={item.status === "active"} className="size-3" />
							{(() => {
								if (item.status === "active") {
									return t("dns.status.active");
								}
								if (item.status === "pending") {
									return t("dns.status.pending");
								}
								return item.status;
							})()}
						</Badge>
						{(() => {
							if (item.receivingProvider === "cloudflare") {
								return (
									<Badge
										variant={item.routingEnabled ? "outline" : "secondary"}
										className={cn(!item.routingEnabled && "")}
									>
										<StatusIcon ok={item.routingEnabled} className="size-3" />
										{t("domains.badge.routing")}
									</Badge>
								);
							}
							if (item.receivingProvider === "none") {
								return (
									<Badge variant="secondary" className="">
										{t("domains.badge.sendingOnly")}
									</Badge>
								);
							}
							return (
								<Badge variant="outline">
									{t("domains.badge.receivingVia", {
										provider:
											item.receivingProvider === "ses"
												? "Amazon SES"
												: "Resend",
									})}
								</Badge>
							);
						})()}
						{(() => {
							if (
								item.sendingProvider === "resend" ||
								item.sendingProvider === "ses"
							) {
								return (
									<Badge variant="outline">
										<StatusIcon ok className="size-3" />
										{t("domains.badge.sendingVia", {
											provider:
												item.sendingProvider === "ses"
													? "Amazon SES"
													: "Resend",
										})}
									</Badge>
								);
							}
							if (item.sendingProvider === "none") {
								return (
									<Badge variant="secondary" className="">
										{t("domains.badge.receivingOnly")}
									</Badge>
								);
							}
							return (
								<Badge
									variant={item.sendingEnabled ? "outline" : "secondary"}
									className={cn(!item.sendingEnabled && "")}
								>
									<StatusIcon ok={item.sendingEnabled} className="size-3" />
									{t("domains.badge.sending")}
								</Badge>
							);
						})()}
					</div>

					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
						{auth &&
							dnsAuthRecords.map((record, index) => (
								<Fragment key={record}>
									{index > 0 && (
										<span className="text-muted-foreground/50">|</span>
									)}
									<span
										className="flex items-center gap-1 text-muted-foreground"
										title={`${record.toUpperCase()} · ${getDnsAuthStatusLabel(auth[record], t)}`}
									>
										<span className="uppercase">{record}</span>
										<StatusIcon
											ok={auth[record] === "ok"}
											className="size-3.5"
										/>
									</span>
								</Fragment>
							))}
						<span className="flex-1" />
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onToggleDns(item.id)}
							aria-expanded={expanded}
						>
							{expanded ? (
								<>
									{t("domains.hideDetails")} <ChevronRight className="size-3" />
								</>
							) : (
								<>
									{t("domains.showDetails")} <ChevronDown className="size-3" />
								</>
							)}
						</Button>
					</div>
				</div>
			</div>

			{expanded &&
				(() => {
					if (dnsDetails) {
						return (
							<DomainDnsDetails
								domain={item}
								dns={dnsDetails}
								onSendingProviderChange={onSendingProviderChange}
								sendingProviderBusy={sendingProviderBusy}
								sendingProviderMessage={sendingProviderMessage}
								onReceivingProviderChange={onReceivingProviderChange}
								receivingProviderBusy={receivingProviderBusy}
								receivingProviderMessage={receivingProviderMessage}
								onDnsChanged={onDnsChanged}
								onSetup={onSetup}
								setupRecord={setupRecord}
								setupMessage={setupMessage}
							/>
						);
					}
					if (dnsError) {
						return (
							<div className="px-4 pt-4 pb-4 text-sm text-destructive sm:px-5 sm:pb-5">
								{dnsError}
							</div>
						);
					}
					if (dnsLoading) {
						return <DomainDnsSkeleton />;
					}
					return null;
				})()}

			<div className="absolute top-2 right-2">
				<AdminRowActions
					title={t("domains.removeDomain")}
					description={t("domains.removeConfirm", { host: item.hostname })}
					confirmLabel={t("domains.removeDomain")}
					match={item.hostname}
					onConfirm={() => remove.mutate(item.id)}
					disabled={remove.isPending}
				/>
			</div>
		</ListRow>
	);
}
