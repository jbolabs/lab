"use client";
import { useAdminConfirmation } from "../admin-confirmation-provider";
import { Empty } from "@/components/ui/empty";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";

import { mobilePrimaryActionClass } from "../admin-ui-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { List } from "@/components/ui/list";
import { CheckCircle2, LoaderCircle, Plus } from "lucide-react";
import { authFetch } from "@/lib/auth/client";
import type { DnsAuthRecord, DnsStatusSummary, Domain, DomainDnsCache, DomainDnsView, DomainPreflight, ReceivingProvider, SendingProvider } from "./types";
import DomainItemCard from "./DomainItemCard";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { checkDomain } from "./utils";
import { confirmMxReplacement } from "./api";

export default function DomainsPage() {
  const { t } = useLanguage();
	const confirm = useAdminConfirmation();
  const qc = useQueryClient();
  const [hostname, setHostname] = useState("");
  // Self-hosted installs without Cloudflare credentials manage DNS by hand.
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await (await authFetch("/api/auth/me")).json()) as { managesDns?: boolean },
  });
  const managesDns = me?.managesDns ?? true;
  const [domainCheck, setDomainCheck] = useState<DomainPreflight | null>(null);
  const [domainChecking, setDomainChecking] = useState(false);
  const [skipDns, setSkipDns] = useState(false);
  const [sendingProvider, setSendingProvider] = useState<SendingProvider>("cloudflare");
  const [receivingProvider, setReceivingProvider] = useState<ReceivingProvider>("cloudflare");
  const [domainCheckError, setDomainCheckError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [setupRecord, setSetupRecord] = useState<DnsAuthRecord | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const expandedIdRef = useRef<string | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [dnsViews, setDnsViews] = useState<DomainDnsCache>({});

  const { data, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: async () => {
      const res = await authFetch("/api/domains?includeDns=true");
      return (await res.json()) as {
        domains: Domain[];
        dns: Record<string, DnsStatusSummary>;
      };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const normalized = hostname.toLowerCase().trim();
      let checkedDomain = domainCheck;
      if (skipDns) {
        checkedDomain = { hostname: normalized, zone: { id: "manual", name: normalized } };
      } else if (checkedDomain?.hostname !== normalized) {
        const result = await checkDomain(normalized);
        if (!result.ok || !result.domain) {
          throw new Error(result.error ?? t("onboarding.domainCheckFailed"));
        }
        checkedDomain = result.domain;
        setDomainCheck(result.domain);
      }
      if (!checkedDomain) throw new Error(t("onboarding.domainCheckFailed"));

      const res = await authFetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: checkedDomain.hostname,
          enableRouting: true,
          skipDns,
          sendingProvider,
          receivingProvider,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("mailboxes.failed"));
      return json;
    },
    onSuccess: () => {
      setHostname("");
      setDomainCheck(null);
      setSkipDns(false);
      setSendingProvider("cloudflare");
      setReceivingProvider("cloudflare");
      setDomainCheckError(null);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["domains"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/domains/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("domains.removeFailed"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });

  const loadDns = async (id: string) => {
    const res = await authFetch(`/api/domains/${id}/dns`);
    const json = (await res.json()) as {
      domain?: Domain;
      dns?: DomainDnsView;
      error?: string;
    };
    if (!res.ok || !json.domain || !json.dns) {
      throw new Error(json.error ?? t("domains.dnsLoadFailed"));
    }
    const loadedView = { domain: json.domain, dns: json.dns };
    setDnsViews((current) => ({ ...current, [id]: loadedView }));
    if (expandedIdRef.current === id) setSetupMessage(null);
  };

  const toggleDns = async (id: string) => {
    if (expandedDomainId === id) {
      expandedIdRef.current = null;
      setExpandedDomainId(null);
      setSetupMessage(null);
      setDnsLoading(false);
      setDnsError(null);
      return;
    }
    // Expand immediately and show a skeleton while the audit is fetched, rather
    // than leaving the card unchanged until the request resolves.
    expandedIdRef.current = id;
    setExpandedDomainId(id);
    setSetupMessage(null);
    setDnsError(null);
    if (dnsViews[id]) {
      setDnsLoading(false);
      return;
    }
    setDnsLoading(true);
    try {
      await loadDns(id);
    } catch (error) {
      if (expandedIdRef.current === id) {
        setDnsError(error instanceof Error ? error.message : t("domains.dnsLoadFailed"));
      }
    } finally {
      if (expandedIdRef.current === id) setDnsLoading(false);
    }
  };

  const [sendingBusy, setSendingBusy] = useState(false);
  const [sendingMessage, setSendingMessage] = useState<string | null>(null);

  const changeSendingProvider = async (provider: SendingProvider) => {
    if (!expandedDomainId) return;
    const id = expandedDomainId;
    setSendingBusy(true);
    setSendingMessage(null);
    try {
      const put = async (replaceMx: boolean) => {
        const res = await authFetch(`/api/domains/${id}/sending`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, replaceMx }),
        });
        return { res, json: (await res.json()) as { warning?: string; error?: string; code?: string; records?: { content: string; priority: number }[] } };
      };
      let { res, json } = await put(false);
      // Cloudflare sending refuses while another service's MX records exist.
      if (await confirmMxReplacement(res, json, confirm)) ({ res, json } = await put(true));
      if (!res.ok) throw new Error(json.error ?? t("domains.sendingChangeFailed"));
      if (json.warning) setSendingMessage(json.warning);
      await loadDns(id);
      qc.invalidateQueries({ queryKey: ["domains"] });
    } catch (error) {
      setSendingMessage(error instanceof Error ? error.message : t("domains.sendingChangeFailed"));
    } finally {
      setSendingBusy(false);
    }
  };

  const [receivingBusy, setReceivingBusy] = useState(false);
  const [receivingMessage, setReceivingMessage] = useState<string | null>(null);

  const changeReceivingProvider = async (provider: ReceivingProvider) => {
    if (!expandedDomainId) return;
    const id = expandedDomainId;
    setReceivingBusy(true);
    setReceivingMessage(null);
    try {
      const res = await authFetch(`/api/domains/${id}/receiving`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("domains.receivingChangeFailed"));
      await loadDns(id);
      qc.invalidateQueries({ queryKey: ["domains"] });
    } catch (error) {
      setReceivingMessage(error instanceof Error ? error.message : t("domains.receivingChangeFailed"));
    } finally {
      setReceivingBusy(false);
    }
  };

  const refreshExpandedDns = () => {
    if (!expandedDomainId) return;
    void loadDns(expandedDomainId).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["domains"] });
  };

  const setupDns = async (record: DnsAuthRecord) => {
    if (!expandedDomainId) return;
    const dnsView = dnsViews[expandedDomainId];
    if (!dnsView) return;
    setSetupRecord(record);
    setSetupMessage(null);
    try {
      const post = async (replaceMx: boolean) => {
        const res = await authFetch(`/api/domains/${dnsView.domain.id}/dns/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ record, replaceMx }),
        });
        return {
          res,
          json: (await res.json()) as {
            domain?: Domain;
            dns?: DomainDnsView;
            error?: string;
            code?: string;
            records?: { content: string; priority: number }[];
          },
        };
      };
      let { res, json } = await post(false);
      if (await confirmMxReplacement(res, json, confirm)) ({ res, json } = await post(true));
      if (!res.ok) throw new Error(json.error ?? t("domains.dnsSetupFailed"));
      if (json.domain && json.dns) {
        const updatedView = { domain: json.domain, dns: json.dns };
        setDnsViews((current) => ({
          ...current,
          [dnsView.domain.id]: updatedView,
        }));
      } else await loadDns(dnsView.domain.id);
      qc.invalidateQueries({ queryKey: ["domains"] });
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : t("domains.dnsSetupFailed"));
    } finally {
      setSetupRecord(null);
    }
  };

  const inspectDomain = async () => {
    const normalized = hostname.toLowerCase().trim();
    if (skipDns || normalized.length < 3 || domainCheck?.hostname === normalized) return;

    setDomainChecking(true);
    setDomainCheckError(null);
    const result = await checkDomain(normalized);
    setDomainChecking(false);
    if (!result.ok || !result.domain) {
      setDomainCheck(null);
      setDomainCheckError(result.error ?? t("onboarding.domainCheckFailed"));
      return;
    }

    setDomainCheck(result.domain);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium">{t("domains.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {managesDns
              ? t("domains.descriptionManaged")
              : t("domains.descriptionManual")}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className={mobilePrimaryActionClass}>
              <Plus data-icon="inline-start" />
              {t("domains.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("domains.addTitle")}</DialogTitle>
              <DialogDescription>
                {t("domains.addDescription")}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="flex flex-col gap-4">
              <Field className="flex flex-col gap-2">
                <FieldLabel htmlFor="hostname">{t("domains.hostname")}</FieldLabel>
                <Input
                  id="hostname"
                  value={hostname}
                  onChange={(e) => {
                    setHostname(e.target.value);
                    if (domainCheck?.hostname !== e.target.value.toLowerCase().trim()) {
                      setDomainCheck(null);
                    }
                  }}
                  onBlur={() => void inspectDomain()}
                  placeholder="example.com"
                />
              </Field>
              <FieldGroup className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
                <Field>
                  <FieldLabel htmlFor="skip-dns">{t("setup.skipDns")}</FieldLabel>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {skipDns ? t("setup.skipDnsOn") : t("setup.skipDnsHint")}
                  </p>
                </Field>
                <Switch
                  id="skip-dns"
                  checked={skipDns}
                  onCheckedChange={(checked) => {
                    setSkipDns(checked);
                    setDomainCheckError(null);
                  }}
                />
              </FieldGroup>
              {!skipDns && (
                <>
              <FieldGroup className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
                <Field>
                  <FieldLabel htmlFor="receiving-provider">{t("domains.receiveWith")}</FieldLabel>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {receivingProvider === "cloudflare"
                      ? t("domains.receiveHintCloudflare")
                      : receivingProvider === "none"
                        ? t("domains.receiveHintNone")
                        : t("domains.providerHintLater")}
                  </p>
                </Field>
                <NativeSelect
                  id="receiving-provider"
                  value={receivingProvider}
                  onChange={(e) => setReceivingProvider(e.target.value as ReceivingProvider)}
                  className="h-9 shrink-0 rounded-md border border-border bg-card px-3 text-sm"
                >
                  <option value="cloudflare">{t("domains.cloudflareRouting")}</option>
                  <option value="resend">Resend</option>
                  <option value="ses">Amazon SES</option>
                  <option value="none">{t("domains.notSelected")}</option>
                </NativeSelect>
              </FieldGroup>
              <FieldGroup className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
                <Field>
                  <FieldLabel htmlFor="sending-provider">{t("domains.sendWith")}</FieldLabel>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {domainChecking
                      ? t("setup.checkingCloudflare")
                      : sendingProvider === "cloudflare"
                        ? t("domains.sendHintCloudflare")
                        : sendingProvider === "none"
                          ? t("domains.sendHintNone")
                          : t("domains.providerHintLater")}
                  </p>
                </Field>
                {domainChecking && <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                <NativeSelect
                  id="sending-provider"
                  value={sendingProvider}
                  onChange={(e) => setSendingProvider(e.target.value as SendingProvider)}
                  className="h-9 shrink-0 rounded-md border border-border bg-card px-3 text-sm"
                >
                  <option value="cloudflare">{t("domains.cloudflareSending")}</option>
                  <option value="resend">Resend</option>
                  <option value="ses">Amazon SES</option>
                  <option value="none">{t("domains.notSelected")}</option>
                </NativeSelect>
              </FieldGroup>
                </>
              )}
              {domainCheck && !skipDns && (
                <div className="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 className="size-4" />
                  {t("setup.domainFound", { zone: domainCheck.zone.name })}
                </div>
              )}
              {domainCheckError && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {domainCheckError}
                </p>
              )}
              {create.isError && (
                <div className="flex flex-col gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p>{(create.error as Error).message}</p>
                  <div className="flex flex-col gap-2">
                    <p className="font-medium">
                      {t("domains.tokenPermissions")}
                    </p>
                    <ul className="list-disc flex flex-col gap-1 pl-5">
                      <li>
                        {t("domains.tokenAccounts")}
                      </li>
                      <li>
                        {t("domains.tokenZones")}
                      </li>
                    </ul>
                  </div>
                </div>
              )}
              <Button
                onClick={() => create.mutate()}
                disabled={!hostname || domainChecking || create.isPending}
              >
                {create.isPending ? t("onboarding.adding") : t("domains.addTitle")}
              </Button>
            </FieldGroup>
          </DialogContent>
        </Dialog>
      </div>
      <section className="flex flex-col gap-3">
        {/* <div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">{(data?.domains ?? []).length} total</span>
				</div> */}
        {isLoading && (
          <SectionRowSkeleton />
        )}
        {!isLoading && (data?.domains ?? []).length === 0 && (
          <Empty className="rounded-lg bg-card px-5 py-4 text-sm text-muted-foreground">
            {t("domains.none")}
          </Empty>
        )}
        <List className="gap-2">
          {(data?.domains ?? []).map((d) => {
            const dns = data?.dns?.[d.id];
            return (
              <DomainItemCard
                key={d.id}
                dns={dns}
                dnsDetails={dnsViews[d.id]?.dns}
                onSendingProviderChange={changeSendingProvider}
                sendingProviderBusy={sendingBusy}
                sendingProviderMessage={expandedDomainId === d.id ? sendingMessage : null}
                onReceivingProviderChange={changeReceivingProvider}
                receivingProviderBusy={receivingBusy}
                receivingProviderMessage={expandedDomainId === d.id ? receivingMessage : null}
                onDnsChanged={refreshExpandedDns}
                dnsLoading={expandedDomainId === d.id && dnsLoading}
                dnsError={expandedDomainId === d.id ? dnsError : null}
                expanded={expandedDomainId === d.id}
                onToggleDns={toggleDns}
                onSetup={setupDns}
                setupRecord={setupRecord}
                setupMessage={setupMessage}
                item={d}
                remove={remove}
              />
            );
          })}
        </List>
      </section>
    </div>
  );
}
