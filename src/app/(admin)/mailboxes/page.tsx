"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { clearMailboxesCache } from "@/components/mailbox-provider-utils";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
} from "@/components/ui/empty";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupInput,
	InputGroupAddon,
	InputGroupText,
} from "@/components/ui/input-group";
import { ItemGroup as List, Item as ListRow } from "@/components/ui/item";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table";
import { authFetch } from "@/lib/auth/client";

import {
	AdminFormPanel as Dialog,
	AdminFormPanelContent as DialogContent,
	AdminFormPanelDescription as DialogDescription,
	AdminFormPanelHeader as DialogHeader,
	AdminFormPanelTitle as DialogTitle,
	AdminFormPanelTrigger as DialogTrigger,
} from "../admin-form-panel";
import type {
	CurrentAccountResponse,
	Domain,
	MailboxOwner,
	MailboxesResponse,
} from "./types";
import { getMailboxAddress, getMailboxesBase, getMailboxName } from "./utils";

export default function MailboxesPage() {
	const { t } = useLanguage();
	const qc = useQueryClient();
	const router = useRouter();
	const base = getMailboxesBase(usePathname());
	const [enteredName, setEnteredName] = useState<string | null>(null);
	const [localPart, setLocalPart] = useState("");
	const [domainId, setDomainId] = useState("");
	const [enteredOwner, setEnteredOwner] = useState<string | null>(null);
	const [mailboxType, setMailboxType] = useState<"personal" | "shared">(
		"personal"
	);
	const [createOpen, setCreateOpen] = useState(false);

	const account = useQuery({
		queryFn: async () => {
			const res = await authFetch("/api/auth/me", {
				redirectOnUnauthorized: false,
			});
			return (await res.json()) as CurrentAccountResponse;
		},
		queryKey: ["auth", "me"],
	});

	const initialName = () => account.data?.user?.name?.trim() || "";
	const displayName = enteredName ?? initialName();
	const ownerUserId = enteredOwner ?? account.data?.user?.id ?? "";

	const accounts = useQuery({
		enabled: createOpen,
		queryFn: async () => {
			const res = await authFetch("/api/accounts");
			if (!res.ok) {
				return { accounts: [] as MailboxOwner[] };
			}
			return (await res.json()) as { accounts: MailboxOwner[] };
		},
		queryKey: ["accounts", "mailbox-owners"],
	});

	const domains = useQuery({
		queryFn: async () => {
			const res = await authFetch("/api/domains");
			return (await res.json()) as { domains: Domain[] };
		},
		queryKey: ["domains"],
	});

	const mailboxes = useQuery({
		queryFn: async () => {
			const res = await authFetch("/api/mailboxes");
			return (await res.json()) as MailboxesResponse;
		},
		queryKey: ["mailboxes"],
	});

	const create = useMutation({
		mutationFn: async () => {
			const res = await authFetch("/api/mailboxes", {
				body: JSON.stringify({
					domainId,
					...(mailboxType === "personal" ? { ownerUserId } : {}),
					displayName: displayName.trim(),
					localPart,
					type: mailboxType,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const json = (await res.json()) as { id?: string; error?: string };
			if (!res.ok) {
				throw new Error(json.error ?? t("mailboxes.failed"));
			}
			setEnteredName(null);
			setLocalPart("");
			setDomainId("");
			setEnteredOwner(null);
			return json.id;
		},
		onSuccess: (mailboxId) => {
			clearMailboxesCache();
			setCreateOpen(false);
			qc.invalidateQueries({ queryKey: ["mailboxes"] });
			if (mailboxType === "shared" && mailboxId) {
				router.push(`${base}/${mailboxId}`);
			}
			setMailboxType("personal");
		},
	});

	const domainMap = new Map(
		(domains.data?.domains ?? []).map((d) => [d.id, d.hostname])
	);
	const mailboxOwners = [...(accounts.data?.accounts ?? [])];
	if (
		account.data?.user?.id &&
		!mailboxOwners.some((owner) => owner.id === account.data?.user?.id)
	) {
		mailboxOwners.unshift({
			email: account.data.user.email ?? "",
			id: account.data.user.id,
			name:
				account.data.user.name ??
				account.data.user.email ??
				t("mailboxes.currentAccount"),
			role: "admin",
		});
	}

	const renderCreateMailboxFields = () => (
		<FieldGroup>
			{mailboxes.data?.canCreateShared && (
				<Field>
					<FieldLabel htmlFor="mailbox-type">{t("mailboxes.type")}</FieldLabel>
					<NativeSelect
						id="mailbox-type"
						value={mailboxType}
						onChange={(event) =>
							setMailboxType(event.target.value as "personal" | "shared")
						}
						containerClassName="w-full"
					>
						<option value="personal">{t("mailboxes.personalInbox")}</option>
						<option value="shared">{t("mailboxes.sharedInbox")}</option>
					</NativeSelect>
				</Field>
			)}
			{mailboxType === "personal" ? (
				<Field>
					<FieldLabel htmlFor="mailbox-owner">
						{t("mailboxes.account")}
					</FieldLabel>
					<NativeSelect
						id="mailbox-owner"
						value={ownerUserId}
						onChange={(event) => {
							const owner = mailboxOwners.find(
								(item) => item.id === event.target.value
							);
							setEnteredOwner(event.target.value);
							if (owner) {
								setEnteredName(owner.name);
							}
						}}
						containerClassName="w-full"
					>
						{mailboxOwners.map((owner) => (
							<option key={owner.id} value={owner.id}>
								{owner.name} ({owner.email})
							</option>
						))}
					</NativeSelect>
				</Field>
			) : (
				<Alert variant="info">
					<AlertDescription>{t("mailboxes.sharedHint")}</AlertDescription>
				</Alert>
			)}
			<Field>
				<FieldLabel htmlFor="mailbox-name">{t("common.name")}</FieldLabel>
				<Input
					id="mailbox-name"
					value={displayName}
					onChange={(event) => setEnteredName(event.target.value)}
					placeholder={t("mailboxes.namePlaceholder")}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="mailbox-username">
					{t("mailboxes.emailAddress")}
				</FieldLabel>
				<div className="flex min-w-0 gap-2">
					<InputGroup className="flex-1">
						<InputGroupInput
							id="mailbox-username"
							value={localPart}
							onChange={(event) => setLocalPart(event.target.value)}
							placeholder={t("mailboxes.localPlaceholder")}
						/>
						<InputGroupAddon align="inline-end">
							<InputGroupText>@</InputGroupText>
						</InputGroupAddon>
					</InputGroup>
					<NativeSelect
						aria-label={t("accounts.domain")}
						containerClassName="w-40 min-w-0 shrink-0"
						value={domainId}
						onChange={(event) => setDomainId(event.target.value)}
					>
						<option value="">{t("accounts.selectDomain")}</option>
						{(domains.data?.domains ?? []).map((domain) => (
							<option key={domain.id} value={domain.id}>
								{domain.hostname}
							</option>
						))}
					</NativeSelect>
				</div>
			</Field>
			{create.isError && (
				<p role="alert" className="text-sm text-destructive">
					{(create.error as Error).message}
				</p>
			)}
			<Button
				onClick={() => create.mutate()}
				disabled={
					(mailboxType === "personal" && !ownerUserId) ||
					!displayName.trim() ||
					!domainId ||
					!localPart ||
					create.isPending
				}
			>
				{create.isPending
					? t("accounts.creating")
					: t("mailboxes.createButton")}
			</Button>
		</FieldGroup>
	);
	const renderMailboxesPage = () => (
		<div className="flex flex-col gap-6">
			<PageHeader className="items-center">
				<PageHeaderText>
					<PageTitle>{t("mailboxes.title")}</PageTitle>
				</PageHeaderText>
				<Dialog open={createOpen} onOpenChange={setCreateOpen}>
					<DialogTrigger render={<Button float="mobile" />}>
						<Plus data-icon="inline-start" />
						{t("mailboxes.new")}
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t("mailboxes.createTitle")}</DialogTitle>
							<DialogDescription>
								{t("mailboxes.createDescription")}
							</DialogDescription>
						</DialogHeader>
						{renderCreateMailboxFields()}
					</DialogContent>
				</Dialog>
			</PageHeader>
			<section className="flex flex-col gap-3">
				{/* <div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">
						{(mailboxes.data?.mailboxes ?? []).length} total
					</span>
				</div> */}
				{mailboxes.isLoading && <SectionRowSkeleton />}
				{!mailboxes.isLoading &&
					(mailboxes.data?.mailboxes ?? []).length === 0 && (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Inbox />
								</EmptyMedia>
								<EmptyDescription>{t("mailboxes.none")}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				<div className="hidden rounded-lg border bg-card md:block">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("common.name")}</TableHead>
								<TableHead>{t("mailboxes.emailAddress")}</TableHead>
								<TableHead>{t("mailboxes.type")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(mailboxes.data?.mailboxes ?? []).map((mailbox) => {
								const item = {
									...mailbox,
									hostname:
										mailbox.hostname ?? domainMap.get(mailbox.domainId) ?? "?",
								};
								return (
									<TableRow key={mailbox.id}>
										<TableCell className="">
											<Link
												href={`${base}/${mailbox.id}`}
												className="font-medium hover:underline"
											>
												{getMailboxName(item)}
											</Link>
										</TableCell>
										<TableCell className="">
											{getMailboxAddress(item)}
										</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{mailbox.type === "shared"
													? t("mailboxes.shared")
													: t("mailboxes.personalInbox")}
											</Badge>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
				<List className="gap-2 md:hidden">
					{(mailboxes.data?.mailboxes ?? []).map((mailbox) => {
						const mailboxWithHostname = {
							...mailbox,
							hostname:
								mailbox.hostname ?? domainMap.get(mailbox.domainId) ?? "?",
						};

						return (
							<ListRow
								variant="outline"
								key={mailbox.id}
								render={
									<Link
										href={`${base}/${mailbox.id}`}
										className="group flex-nowrap"
									/>
								}
							>
								<span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-signal-soft text-sm font-semibold text-signal">
									{getMailboxName(mailboxWithHostname)
										.trim()
										.charAt(0)
										.toUpperCase() || "?"}
									{mailbox.hasAvatar && (
										<ProgressiveAvatarImage
											src={`/api/mailboxes/${mailbox.id}/avatar`}
											alt={t("mailboxes.profileAlt", {
												name: getMailboxName(mailboxWithHostname),
											})}
											className="absolute inset-0 size-full object-cover"
										/>
									)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="flex min-w-0 items-center gap-2">
										<span className="block truncate text-sm font-semibold text-foreground">
											{getMailboxName(mailboxWithHostname)}
										</span>
										{mailbox.type === "shared" && (
											<Badge variant="signal">
												<UsersRound />
												{t("mailboxes.shared")}
											</Badge>
										)}
									</span>
									<span className="block truncate font-sans text-sm text-muted-foreground">
										{getMailboxAddress(mailboxWithHostname)}
									</span>
								</span>
							</ListRow>
						);
					})}
				</List>
			</section>
		</div>
	);
	return renderMailboxesPage();
}
