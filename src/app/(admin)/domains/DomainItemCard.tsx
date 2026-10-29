import { AdminRowActions } from "../admin-row-actions";
import { Fragment } from "react";
import { useLanguage } from "@/components/language-provider";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item as ListRow } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import DomainDnsDetails from "./DomainDnsDetails";
import DomainDnsSkeleton from "./DomainDnsSkeleton";
import { dnsAuthRecords, getDnsAuthStatusLabel } from "./utils";
import {
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Globe2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import type { DomainItemCardProps } from "./types";

function StatusIcon({ ok, className }: { ok: boolean; className?: string }) {
  if (ok) return <Check className={cn(className, "text-foreground")} />;
  return <AlertTriangle className={cn(className, "text-amber-500")} />;
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
    <ListRow variant="outline" className="group relative flex-col items-stretch gap-3 max-md:rounded-none max-md:border-b max-md:border-border max-md:px-0 max-md:py-4 max-md:last:border-b-0">
      <div className="flex flex-col items-start gap-3 md:flex-row md:gap-4">
        <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
          <Globe2 className="size-5" />
          <img
            src={`https://${item.hostname}/favicon.ico`}
            alt=""
            className="absolute inset-0 h-full w-full object-contain p-1"
            onError={(event) => event.currentTarget.remove()}
          />
        </span>

        <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
          <span className="min-w-0 truncate pr-10 text-sm font-semibold text-foreground">
            {item.hostname}
          </span>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant={item.status === "active" ? "outline" : "secondary"}
              className="gap-1"
            >
              <StatusIcon ok={item.status === "active"} className="size-3" />
              {item.status === "active" ? t("dns.status.active") : item.status === "pending" ? t("dns.status.pending") : item.status}
            </Badge>
            {item.receivingProvider === "cloudflare" ? (
              <Badge
                variant={item.routingEnabled ? "outline" : "secondary"}
                className={cn("gap-1", !item.routingEnabled && "opacity-50")}
              >
                <StatusIcon ok={item.routingEnabled} className="size-3" />
                {t("domains.badge.routing")}
              </Badge>
            ) : item.receivingProvider === "none" ? (
              <Badge variant="secondary" className="gap-1 opacity-50">
                {t("domains.badge.sendingOnly")}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                {t("domains.badge.receivingVia", { provider: item.receivingProvider === "ses" ? "Amazon SES" : "Resend" })}
              </Badge>
            )}
            {item.sendingProvider === "resend" || item.sendingProvider === "ses" ? (
              <Badge variant="outline" className="gap-1">
                <StatusIcon ok className="size-3" />
                {t("domains.badge.sendingVia", { provider: item.sendingProvider === "ses" ? "Amazon SES" : "Resend" })}
              </Badge>
            ) : item.sendingProvider === "none" ? (
              <Badge variant="secondary" className="gap-1 opacity-50">
                {t("domains.badge.receivingOnly")}
              </Badge>
            ) : (
              <Badge
                variant={item.sendingEnabled ? "outline" : "secondary"}
                className={cn("gap-1", !item.sendingEnabled && "opacity-50")}
              >
                <StatusIcon ok={item.sendingEnabled} className="size-3" />
                {t("domains.badge.sending")}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {auth &&
              dnsAuthRecords.map((record, index) => (
                <Fragment key={record}>
                  {index > 0 && <span className="text-muted-foreground/50">|</span>}
                  <span
                    className="flex items-center gap-1 text-muted-foreground"
                    title={`${record.toUpperCase()} · ${getDnsAuthStatusLabel(auth[record], t)}`}
                  >
                    <span className="uppercase">{record}</span>
                    <StatusIcon
                      ok={auth[record] === "ok"}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                </Fragment>
              ))}
            <span className="flex-1" />
            <Button variant="ghost" size="sm"
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
        (dnsDetails ? (
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
        ) : dnsError ? (
          <div className="px-4 pb-4 pt-4 text-sm text-red-600 sm:px-5 sm:pb-5">
            {dnsError}
          </div>
        ) : dnsLoading ? (
          <DomainDnsSkeleton />
        ) : null)}

		<div className="absolute right-2 top-2"><AdminRowActions title={t("domains.removeDomain")} description={t("domains.removeConfirm", { host: item.hostname })} confirmLabel={t("domains.removeDomain")} match={item.hostname} onConfirm={() => remove.mutate(item.id)} disabled={remove.isPending} /></div>
    </ListRow>
  );
}
