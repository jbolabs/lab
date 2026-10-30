"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Globe2, LoaderCircle, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
} from "@/components/ui/empty";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { List } from "@/components/ui/list";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { runAsyncAction } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

import { useAdminConfirmation } from "../admin-confirmation-provider";
import { confirmMxReplacement } from "./api";
import DomainItemCard from "./domain-item-card";
import type {
	DnsAuthRecord,
	DnsStatusSummary,
	Domain,
	DomainDnsCache,
	DomainDnsView,
	DomainPreflight,
	ReceivingProvider,
	SendingProvider,
} from "./types";
import { checkDomain } from "./utils";

export default function DomainsPage() {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const qc = useQueryClient();
	const [hostname, setHostname] = useState("");
	// Self-hosted installs without Cloudflare credentials manage DNS by hand.
	const { data: me } = useQuery({
		queryFn: async () => {
			const response = await authFetch("/api/auth/me");
			return (await response.json()) as { managesDns?: boolean };
		},
		queryKey: ["me"],
	});
	const managesDns = me?.managesDns ?? true;
	const [domainCheck, setDomainCheck] = useState<DomainPreflight | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);
	const [skipDns, setSkipDns] = useState(false);
	const [sendingProvider, setSendingProvider] =
		useState<SendingProvider>("cloudflare");
	const [receivingProvider, setReceivingProvider] =
		useState<ReceivingProvider>("cloudflare");
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
		queryFn: async () => {
			const res = await authFetch("/api/domains?includeDns=true");
			return (await res.json()) as {
				domains: Domain[];
				dns: Record<string, DnsStatusSummary>;
			};
		},
		queryKey: ["domains"],
	});

	const create = useMutation({
		mutationFn: async () => {
			const normalized = hostname.toLowerCase().trim();
			let checkedDomain = domainCheck;
			if (skipDns) {
				checkedDomain = {
					hostname: normalized,
					zone: { id: "manual", name: normalized },
				};
			} else if (checkedDomain?.hostname !== normalized) {
				const result = await checkDomain(normalized);
				if (!result.ok || !result.domain) {
					throw new Error(result.error ?? t("onboarding.domainCheckFailed"));
				}
				checkedDomain = result.domain;
				setDomainCheck(result.domain);
			}
			if (!checkedDomain) {
				throw new Error(t("onboarding.domainCheckFailed"));
			}

			const res = await authFetch("/api/domains", {
				body: JSON.stringify({
					enableRouting: true,
					hostname: checkedDomain.hostname,
					receivingProvider,
					sendingProvider,
					skipDns,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const json = (await res.json()) as { error?: string };
			if (!res.ok) {
				throw new Error(json.error ?? t("mailboxes.failed"));
			}
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
			if (!res.ok) {
				throw new Error(t("domains.removeFailed"));
			}
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
		const loadedView = { dns: json.dns, domain: json.domain };
		setDnsViews((current) => ({ ...current, [id]: loadedView }));
		if (expandedIdRef.current === id) {
			setSetupMessage(null);
		}
	};

	const toggleDns = (id: string) => {
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
		return runAsyncAction(
			async () => {
				await loadDns(id);
			},
			(failure) => {
				if (expandedIdRef.current === id) {
					setDnsError(
						failure instanceof Error
							? failure.message
							: t("domains.dnsLoadFailed")
					);
				}
			},
			() => {
				if (expandedIdRef.current === id) {
					setDnsLoading(false);
				}
			}
		);
	};

	const [sendingBusy, setSendingBusy] = useState(false);
	const [sendingMessage, setSendingMessage] = useState<string | null>(null);

	const changeSendingProvider = (provider: SendingProvider) => {
		if (!expandedDomainId) {
			return;
		}
		const id = expandedDomainId;
		setSendingBusy(true);
		setSendingMessage(null);
		return runAsyncAction(
			async () => {
				const put = async (replaceMx: boolean) => {
					const res = await authFetch(`/api/domains/${id}/sending`, {
						body: JSON.stringify({ provider, replaceMx }),
						headers: { "Content-Type": "application/json" },
						method: "PUT",
					});
					return {
						json: (await res.json()) as {
							warning?: string;
							error?: string;
							code?: string;
							records?: { content: string; priority: number }[];
						},
						res,
					};
				};
				let { res, json } = await put(false);
				// Cloudflare sending refuses while another service's MX records exist.
				if (await confirmMxReplacement(res, json, confirm)) {
					({ res, json } = await put(true));
				}
				if (!res.ok) {
					throw new Error(json.error ?? t("domains.sendingChangeFailed"));
				}
				if (json.warning) {
					setSendingMessage(json.warning);
				}
				await loadDns(id);
				qc.invalidateQueries({ queryKey: ["domains"] });
			},
			(failure) => {
				setSendingMessage(
					failure instanceof Error
						? failure.message
						: t("domains.sendingChangeFailed")
				);
			},
			() => {
				setSendingBusy(false);
			}
		);
	};

	const [receivingBusy, setReceivingBusy] = useState(false);
	const [receivingMessage, setReceivingMessage] = useState<string | null>(null);

	const changeReceivingProvider = (provider: ReceivingProvider) => {
		if (!expandedDomainId) {
			return;
		}
		const id = expandedDomainId;
		setReceivingBusy(true);
		setReceivingMessage(null);
		return runAsyncAction(
			async () => {
				const res = await authFetch(`/api/domains/${id}/receiving`, {
					body: JSON.stringify({ provider }),
					headers: { "Content-Type": "application/json" },
					method: "PUT",
				});
				const json = (await res.json()) as { error?: string };
				if (!res.ok) {
					throw new Error(json.error ?? t("domains.receivingChangeFailed"));
				}
				await loadDns(id);
				qc.invalidateQueries({ queryKey: ["domains"] });
			},
			(failure) => {
				setReceivingMessage(
					failure instanceof Error
						? failure.message
						: t("domains.receivingChangeFailed")
				);
			},
			() => {
				setReceivingBusy(false);
			}
		);
	};

	const refreshExpandedDns = () => {
		if (!expandedDomainId) {
			return;
		}
		loadDns(expandedDomainId).catch(() => {
			/* empty */
		});
		qc.invalidateQueries({ queryKey: ["domains"] });
	};

	const setupDns = (record: DnsAuthRecord) => {
		if (!expandedDomainId) {
			return;
		}
		const dnsView = dnsViews[expandedDomainId];
		if (!dnsView) {
			return;
		}
		const post = async (replaceMx: boolean) => {
			const res = await authFetch(
				`/api/domains/${dnsView.domain.id}/dns/setup`,
				{
					body: JSON.stringify({ record, replaceMx }),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				}
			);
			return {
				json: (await res.json()) as {
					domain?: Domain;
					dns?: DomainDnsView;
					error?: string;
					code?: string;
					records?: { content: string; priority: number }[];
				},
				res,
			};
		};
		setSetupRecord(record);
		setSetupMessage(null);
		return runAsyncAction(
			async () => {
				let { res, json } = await post(false);
				if (await confirmMxReplacement(res, json, confirm)) {
					({ res, json } = await post(true));
				}
				if (!res.ok) {
					throw new Error(json.error ?? t("domains.dnsSetupFailed"));
				}
				if (json.domain && json.dns) {
					const updatedView = { dns: json.dns, domain: json.domain };
					setDnsViews((current) => ({
						...current,
						[dnsView.domain.id]: updatedView,
					}));
				} else {
					await loadDns(dnsView.domain.id);
				}
				qc.invalidateQueries({ queryKey: ["domains"] });
			},
			(failure) => {
				setSetupMessage(
					failure instanceof Error
						? failure.message
						: t("domains.dnsSetupFailed")
				);
			},
			() => {
				setSetupRecord(null);
			}
		);
	};

	const inspectDomain = async () => {
		const normalized = hostname.toLowerCase().trim();
		if (
			skipDns ||
			normalized.length < 3 ||
			domainCheck?.hostname === normalized
		) {
			return;
		}

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

	const renderNewDomainFields = () => (
		<FieldGroup>
			<Field>
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
					onBlur={() => inspectDomain()}
					placeholder="example.com"
				/>
			</Field>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="skip-dns">{t("setup.skipDns")}</FieldLabel>
					<FieldDescription>
						{skipDns ? t("setup.skipDnsOn") : t("setup.skipDnsHint")}
					</FieldDescription>
				</FieldContent>
				<Switch
					id="skip-dns"
					checked={skipDns}
					onCheckedChange={(checked) => {
						setSkipDns(checked);
						setDomainCheckError(null);
					}}
				/>
			</Field>
			{!skipDns && (
				<>
					<Field orientation="horizontal">
						<FieldContent>
							<FieldLabel htmlFor="receiving-provider">
								{t("domains.receiveWith")}
							</FieldLabel>
							<FieldDescription>
								{(() => {
									if (receivingProvider === "cloudflare") {
										return t("domains.receiveHintCloudflare");
									}
									if (receivingProvider === "none") {
										return t("domains.receiveHintNone");
									}
									return t("domains.providerHintLater");
								})()}
							</FieldDescription>
						</FieldContent>
						<NativeSelect
							id="receiving-provider"
							value={receivingProvider}
							onChange={(e) =>
								setReceivingProvider(e.target.value as ReceivingProvider)
							}
							containerClassName="shrink-0"
						>
							<option value="cloudflare">
								{t("domains.cloudflareRouting")}
							</option>
							<option value="resend">Resend</option>
							<option value="ses">Amazon SES</option>
							<option value="none">{t("domains.notSelected")}</option>
						</NativeSelect>
					</Field>
					<Field orientation="horizontal">
						<FieldContent>
							<FieldLabel htmlFor="sending-provider">
								{t("domains.sendWith")}
							</FieldLabel>
							<FieldDescription>
								{(() => {
									if (domainChecking) {
										return t("setup.checkingCloudflare");
									}
									if (sendingProvider === "cloudflare") {
										return t("domains.sendHintCloudflare");
									}
									if (sendingProvider === "none") {
										return t("domains.sendHintNone");
									}
									return t("domains.providerHintLater");
								})()}
							</FieldDescription>
						</FieldContent>
						{domainChecking && (
							<LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
						)}
						<NativeSelect
							id="sending-provider"
							value={sendingProvider}
							onChange={(e) =>
								setSendingProvider(e.target.value as SendingProvider)
							}
							containerClassName="shrink-0"
						>
							<option value="cloudflare">
								{t("domains.cloudflareSending")}
							</option>
							<option value="resend">Resend</option>
							<option value="ses">Amazon SES</option>
							<option value="none">{t("domains.notSelected")}</option>
						</NativeSelect>
					</Field>
				</>
			)}
			{domainCheck && !skipDns && (
				<Alert variant="success">
					<CheckCircle2 />
					<AlertDescription>
						{t("setup.domainFound", { zone: domainCheck.zone.name })}
					</AlertDescription>
				</Alert>
			)}
			{domainCheckError && (
				<Alert variant="error">
					<AlertDescription>{domainCheckError}</AlertDescription>
				</Alert>
			)}
			{create.isError && (
				<Alert variant="error">
					<AlertDescription>
						<p>{(create.error as Error).message}</p>
						<div className="flex flex-col gap-2">
							<p className="font-medium">{t("domains.tokenPermissions")}</p>
							<ul className="flex list-disc flex-col gap-1 pl-5">
								<li>{t("domains.tokenAccounts")}</li>
								<li>{t("domains.tokenZones")}</li>
							</ul>
						</div>
					</AlertDescription>
				</Alert>
			)}
			<Button
				onClick={() => create.mutate()}
				disabled={!hostname || domainChecking || create.isPending}
			>
				{create.isPending ? t("onboarding.adding") : t("domains.addTitle")}
			</Button>
		</FieldGroup>
	);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader className="items-center">
				<PageHeaderText>
					<PageTitle>{t("domains.title")}</PageTitle>
					<PageDescription>
						{managesDns
							? t("domains.descriptionManaged")
							: t("domains.descriptionManual")}
					</PageDescription>
				</PageHeaderText>
				<Dialog open={createOpen} onOpenChange={setCreateOpen}>
					<DialogTrigger render={<Button float="mobile" />}>
						<Plus data-icon="inline-start" />
						{t("domains.new")}
					</DialogTrigger>
					<DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>{t("domains.addTitle")}</DialogTitle>
							<DialogDescription>
								{t("domains.addDescription")}
							</DialogDescription>
						</DialogHeader>
						{renderNewDomainFields()}
					</DialogContent>
				</Dialog>
			</PageHeader>
			<section className="flex flex-col gap-3">
				{/* <div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">{(data?.domains ?? []).length} total</span>
				</div> */}
				{isLoading && <SectionRowSkeleton />}
				{!isLoading && (data?.domains ?? []).length === 0 && (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Globe2 />
							</EmptyMedia>
							<EmptyDescription>{t("domains.none")}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
				<List className="">
					{(data?.domains ?? []).map((d) => {
						const dns = data?.dns?.[d.id];
						return (
							<DomainItemCard
								key={d.id}
								dns={dns}
								dnsDetails={dnsViews[d.id]?.dns}
								onSendingProviderChange={changeSendingProvider}
								sendingProviderBusy={sendingBusy}
								sendingProviderMessage={
									expandedDomainId === d.id ? sendingMessage : null
								}
								onReceivingProviderChange={changeReceivingProvider}
								receivingProviderBusy={receivingBusy}
								receivingProviderMessage={
									expandedDomainId === d.id ? receivingMessage : null
								}
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
