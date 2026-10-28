"use client";
import { Empty } from "@/components/ui/empty";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { mobilePrimaryActionClass } from "../admin-ui-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, UsersRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AdminFormPanel as Dialog, AdminFormPanelContent as DialogContent, AdminFormPanelDescription as DialogDescription, AdminFormPanelHeader as DialogHeader, AdminFormPanelTitle as DialogTitle, AdminFormPanelTrigger as DialogTrigger } from "../admin-form-panel";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ItemGroup as List, Item as ListRow } from "@/components/ui/item";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { clearMailboxesCache } from "@/components/mailbox-provider-utils";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { authFetch } from "@/lib/auth/client";
import type { CurrentAccountResponse, Domain, MailboxOwner, MailboxesResponse } from "./types";
import { getMailboxAddress, getMailboxesBase, getMailboxName } from "./utils";

export default function MailboxesPage() {
	const { t } = useLanguage();
	const qc = useQueryClient();
	const router = useRouter();
	const base = getMailboxesBase(usePathname());
	const [displayName, setDisplayName] = useState("");
	const [localPart, setLocalPart] = useState("");
	const [domainId, setDomainId] = useState("");
	const [ownerUserId, setOwnerUserId] = useState("");
	const [mailboxType, setMailboxType] = useState<"personal" | "shared">("personal");
	const [createOpen, setCreateOpen] = useState(false);

	const account = useQuery({
		queryKey: ["auth", "me"],
		queryFn: async () => {
			const res = await authFetch("/api/auth/me", { redirectOnUnauthorized: false });
			return (await res.json()) as CurrentAccountResponse;
		},
	});

	useEffect(() => {
		if (!createOpen) return;
		setDisplayName((currentName) => currentName || account.data?.user?.name?.trim() || "");
		setOwnerUserId((currentId) => currentId || account.data?.user?.id || "");
	}, [account.data?.user?.id, account.data?.user?.name, createOpen]);

	const accounts = useQuery({
		queryKey: ["accounts", "mailbox-owners"],
		queryFn: async () => {
			const res = await authFetch("/api/accounts");
			if (!res.ok) return { accounts: [] as MailboxOwner[] };
			return (await res.json()) as { accounts: MailboxOwner[] };
		},
		enabled: createOpen,
	});

	const domains = useQuery({
		queryKey: ["domains"],
		queryFn: async () => {
			const res = await authFetch("/api/domains");
			return (await res.json()) as { domains: Domain[] };
		},
	});

	const mailboxes = useQuery({
		queryKey: ["mailboxes"],
		queryFn: async () => {
			const res = await authFetch("/api/mailboxes");
			return (await res.json()) as MailboxesResponse;
		},
	});

	const create = useMutation({
		mutationFn: async () => {
			const res = await authFetch("/api/mailboxes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					domainId,
					...(mailboxType === "personal" ? { ownerUserId } : {}),
					localPart,
					displayName: displayName.trim(),
					type: mailboxType,
				}),
			});
			const json = (await res.json()) as { id?: string; error?: string };
			if (!res.ok) throw new Error(json.error ?? t("mailboxes.failed"));
			setDisplayName("");
			setLocalPart("");
			setDomainId("");
			setOwnerUserId("");
			return json.id;
		},
		onSuccess: (mailboxId) => {
			clearMailboxesCache();
			setCreateOpen(false);
			qc.invalidateQueries({ queryKey: ["mailboxes"] });
			if (mailboxType === "shared" && mailboxId) router.push(`${base}/${mailboxId}`);
			setMailboxType("personal");
		},
	});

	const domainMap = new Map(
		(domains.data?.domains ?? []).map((d) => [d.id, d.hostname]),
	);
	const mailboxOwners = [...(accounts.data?.accounts ?? [])];
	if (account.data?.user?.id && !mailboxOwners.some((owner) => owner.id === account.data?.user?.id)) {
		mailboxOwners.unshift({
			id: account.data.user.id,
			email: account.data.user.email ?? "",
			name: account.data.user.name ?? account.data.user.email ?? t("mailboxes.currentAccount"),
			role: "admin",
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl md:text-3xl font-medium">{t("mailboxes.title")}</h1>
				<Dialog open={createOpen} onOpenChange={setCreateOpen}>
					<DialogTrigger asChild>
						<Button className={mobilePrimaryActionClass}>
							<Plus data-icon="inline-start" />
							{t("mailboxes.new")}
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t("mailboxes.createTitle")}</DialogTitle>
							<DialogDescription>{t("mailboxes.createDescription")}</DialogDescription>
						</DialogHeader>
						<FieldGroup className="flex flex-col gap-4">
							{mailboxes.data?.canCreateShared && (
								<Field className="flex flex-col gap-2">
									<FieldLabel htmlFor="mailbox-type">{t("mailboxes.type")}</FieldLabel>
									<NativeSelect
										id="mailbox-type"
										value={mailboxType}
										onChange={(event) => setMailboxType(event.target.value as "personal" | "shared")}
										className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none"
									>
										<option value="personal">{t("mailboxes.personalInbox")}</option>
										<option value="shared">{t("mailboxes.sharedInbox")}</option>
									</NativeSelect>
								</Field>
							)}
							{mailboxType === "personal" ? (
							<Field className="flex flex-col gap-2">
								<FieldLabel htmlFor="mailbox-owner">{t("mailboxes.account")}</FieldLabel>
								<NativeSelect
									id="mailbox-owner"
									value={ownerUserId}
									onChange={(event) => {
										const owner = mailboxOwners.find((item) => item.id === event.target.value);
										setOwnerUserId(event.target.value);
										if (owner) setDisplayName(owner.name);
									}}
									className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none"
								>
									{mailboxOwners.map((owner) => (
										<option key={owner.id} value={owner.id}>
											{owner.name} ({owner.email})
										</option>
									))}
								</NativeSelect>
							</Field>
							) : (
								<p className="rounded-lg bg-signal-soft px-4 py-3 text-sm text-signal-soft-foreground">
									{t("mailboxes.sharedHint")}
								</p>
							)}
							<Field className="flex flex-col gap-2">
								<FieldLabel htmlFor="mailbox-name">{t("common.name")}</FieldLabel>
								<Input
									id="mailbox-name"
									value={displayName}
									onChange={(event) => setDisplayName(event.target.value)}
									placeholder={t("mailboxes.namePlaceholder")}
								/>
							</Field>
							<Field className="flex flex-col gap-2">
								<FieldLabel htmlFor="mailbox-username">{t("mailboxes.emailAddress")}</FieldLabel>
								<InputGroup>
									<InputGroupInput
										id="mailbox-username"
										value={localPart}
										onChange={(event) => setLocalPart(event.target.value)}
										placeholder={t("mailboxes.localPlaceholder")}

									/>
									<InputGroupAddon align="inline-end"><InputGroupText>@</InputGroupText>
									<NativeSelect
										aria-label={t("accounts.domain")}
										containerClassName="w-36 shrink-0"
										className="rounded-none border-0 shadow-none"
										value={domainId}
										onChange={(event) => setDomainId(event.target.value)}
									>
										<option value="">{t("accounts.selectDomain")}</option>
										{(domains.data?.domains ?? []).map((domain) => (
											<option key={domain.id} value={domain.id}>
												{domain.hostname}
											</option>
										))}
									</NativeSelect></InputGroupAddon>
								</InputGroup>
							</Field>
							{create.isError && (
								<p role="alert" className="text-sm text-red-600">{(create.error as Error).message}</p>
							)}
							<Button
								onClick={() => create.mutate()}
								disabled={(mailboxType === "personal" && !ownerUserId) || !displayName.trim() || !domainId || !localPart || create.isPending}
							>
								{create.isPending ? t("accounts.creating") : t("mailboxes.createButton")}
							</Button>
						</FieldGroup>
					</DialogContent>
				</Dialog>
			</div>
			<section className="flex flex-col gap-3">
				{/* <div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">
						{(mailboxes.data?.mailboxes ?? []).length} total
					</span>
				</div> */}
				{mailboxes.isLoading && (
					<SectionRowSkeleton />
				)}
				{!mailboxes.isLoading && (mailboxes.data?.mailboxes ?? []).length === 0 && (
					<Empty className="rounded-lg bg-card px-5 py-4 text-sm text-muted-foreground">
						{t("mailboxes.none")}
					</Empty>
				)}
				<div className="hidden rounded-lg border bg-card md:block"><Table><TableHeader><TableRow><TableHead>{t("common.name")}</TableHead><TableHead>{t("mailboxes.emailAddress")}</TableHead><TableHead>{t("mailboxes.type")}</TableHead></TableRow></TableHeader><TableBody>{(mailboxes.data?.mailboxes ?? []).map((mailbox) => {
					const item = { ...mailbox, hostname: mailbox.hostname ?? domainMap.get(mailbox.domainId) ?? "?" };
					return <TableRow key={mailbox.id}><TableCell className="py-4"><Link href={`${base}/${mailbox.id}`} className="font-medium hover:underline">{getMailboxName(item)}</Link></TableCell><TableCell className="text-muted-foreground">{getMailboxAddress(item)}</TableCell><TableCell><Badge variant="secondary">{mailbox.type === "shared" ? t("mailboxes.shared") : t("mailboxes.personalInbox")}</Badge></TableCell></TableRow>;
				})}</TableBody></Table></div>
				<List className="gap-2 md:hidden">
					{(mailboxes.data?.mailboxes ?? []).map((mailbox) => {
						const mailboxWithHostname = {
							...mailbox,
							hostname: mailbox.hostname ?? domainMap.get(mailbox.domainId) ?? "?",
						};

						return (
							<ListRow variant="outline" key={mailbox.id} asChild>
								<Link
									href={`${base}/${mailbox.id}`}
									className="group flex-nowrap px-4 py-4"
								>
									<span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-signal-soft text-sm font-semibold text-signal">
										{getMailboxName(mailboxWithHostname).trim().charAt(0).toUpperCase() || "?"}
										{mailbox.hasAvatar && (
											<ProgressiveAvatarImage
												src={`/api/mailboxes/${mailbox.id}/avatar`}
												alt={t("mailboxes.profileAlt", { name: getMailboxName(mailboxWithHostname) })}
												className="absolute inset-0 h-full w-full object-cover"
											/>
										)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex min-w-0 items-center gap-2">
											<span className="block truncate text-sm font-semibold text-foreground">
												{getMailboxName(mailboxWithHostname)}
											</span>
											{mailbox.type === "shared" && (
												<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal">
													<UsersRound className="size-3" />
													{t("mailboxes.shared")}
												</span>
											)}
										</span>
										<span className="block truncate no-font-mono text-sm text-muted-foreground">
											{getMailboxAddress(mailboxWithHostname)}
										</span>
									</span>
								</Link>
							</ListRow>
						);
					})}
				</List>
			</section>
		</div>
	);
}
