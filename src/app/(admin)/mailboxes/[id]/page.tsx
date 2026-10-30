"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Save, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
} from "@/components/ui/item";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams, usePathname, useRouter } from "@/lib/navigation";

import {
	AdminConfirmationProvider,
	useAdminConfirmation,
} from "../../admin-confirmation-provider";
import { getMailboxesBase } from "../utils";
import MailboxAvatarForm from "./mailbox-avatar-form";
import {
	createMailboxAlias,
	deleteMailbox,
	deleteMailboxAlias,
	fetchMailbox,
	fetchMailboxAliases,
	fetchSharedInboxAccess,
	getMailboxAddress,
	grantSharedInboxAccess,
	revokeSharedInboxAccess,
	updateMailboxSettings,
} from "./utils";

function MailboxSettingsPage() {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const params = useParams<{ id: string }>();
	const mailboxId = params.id;
	const qc = useQueryClient();
	const [editedName, setEditedName] = useState<string | null>(null);
	const [editedAllDomains, setEditedAllDomains] = useState<boolean | null>(
		null
	);
	const [selectedUserId, setSelectedUserId] = useState("");
	const [aliasLocalPart, setAliasLocalPart] = useState("");
	const [editedAliasDomain, setEditedAliasDomain] = useState<string | null>(
		null
	);

	const mailbox = useQuery({
		enabled: !!mailboxId,
		queryFn: () => fetchMailbox(mailboxId),
		queryKey: ["mailbox", mailboxId],
	});

	const displayName = editedName ?? mailbox.data?.displayName ?? "";
	const useAllDomains = editedAllDomains ?? mailbox.data?.useAllDomains ?? true;
	const aliasDomainId = editedAliasDomain ?? mailbox.data?.domainId ?? "";

	const updateName = useMutation({
		mutationFn: () =>
			updateMailboxSettings(mailboxId, { displayName, useAllDomains }),
		onSuccess: (updatedMailbox) => {
			qc.setQueryData(["mailbox", mailboxId], updatedMailbox);
			qc.invalidateQueries({ queryKey: ["mailboxes"] });
		},
	});

	const router = useRouter();
	const base = getMailboxesBase(usePathname());
	const removeMailbox = useMutation({
		mutationFn: () => deleteMailbox(mailboxId),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["mailboxes"] });
			router.push(base);
		},
	});

	const aliases = useQuery({
		enabled: !!mailboxId,
		queryFn: () => fetchMailboxAliases(mailboxId),
		queryKey: ["mailbox", mailboxId, "aliases"],
	});
	const addAlias = useMutation({
		mutationFn: () =>
			createMailboxAlias(mailboxId, {
				domainId: aliasDomainId,
				localPart: aliasLocalPart.trim(),
			}),
		onSuccess: async () => {
			setAliasLocalPart("");
			await qc.invalidateQueries({
				queryKey: ["mailbox", mailboxId, "aliases"],
			});
		},
	});
	const removeAlias = useMutation({
		mutationFn: (aliasId: string) => deleteMailboxAlias(mailboxId, aliasId),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["mailbox", mailboxId, "aliases"] }),
	});

	const sharedAccess = useQuery({
		enabled: mailbox.data?.type === "shared",
		queryFn: () => fetchSharedInboxAccess(mailboxId),
		queryKey: ["mailbox", mailboxId, "access"],
	});
	const addMember = useMutation({
		mutationFn: () => grantSharedInboxAccess(mailboxId, selectedUserId),
		onSuccess: async () => {
			setSelectedUserId("");
			await qc.invalidateQueries({
				queryKey: ["mailbox", mailboxId, "access"],
			});
		},
	});
	const removeMember = useMutation({
		mutationFn: (userId: string) => revokeSharedInboxAccess(mailboxId, userId),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["mailbox", mailboxId, "access"] }),
	});

	const address = mailbox.data ? getMailboxAddress(mailbox.data) : "";

	const renderMailboxAccount = () => (
		<Card>
			<CardHeader>
				<CardTitle>{t("mailbox.sharedAccess")}</CardTitle>
				<CardDescription>
					{t("mailbox.sharedAccessDescription")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{sharedAccess.isLoading && (
					<Skeleton className="h-16 w-full rounded-lg" />
				)}
				{(sharedAccess.data?.members ?? []).map((member) => (
					<Item key={member.userId} variant="muted" size="sm">
						<ItemContent className="min-w-0">
							<p className="truncate text-sm font-medium">{member.userName}</p>
							<ItemDescription>
								<span className="block truncate">{member.userEmail}</span>
							</ItemDescription>
						</ItemContent>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={t("mailbox.removeAddress", {
								address: member.userName,
							})}
							disabled={removeMember.isPending}
							onClick={() => removeMember.mutate(member.userId)}
							className="text-destructive"
						>
							<Trash2 />
						</Button>
					</Item>
				))}
				{sharedAccess.data && sharedAccess.data.members.length === 0 && (
					<p className="text-sm text-muted-foreground">
						{t("mailbox.noMembers")}
					</p>
				)}
				{sharedAccess.isError && (
					<p className="text-sm text-destructive">
						{sharedAccess.error instanceof Error
							? sharedAccess.error.message
							: t("mailbox.sharedLoadFailed")}
					</p>
				)}
				<div className="flex gap-2">
					<NativeSelect
						aria-label={t("mailbox.chooseAccount")}
						value={selectedUserId}
						onChange={(event) => setSelectedUserId(event.target.value)}
						containerClassName="min-w-0 flex-1"
					>
						<option value="">{t("mailbox.chooseAccount")}</option>
						{(sharedAccess.data?.availableUsers ?? [])
							.filter(
								(account) =>
									!sharedAccess.data?.members.some(
										(member) => member.userId === account.id
									)
							)
							.map((account) => (
								<option key={account.id} value={account.id}>
									{account.name} ({account.email})
								</option>
							))}
					</NativeSelect>
					<Button
						type="button"
						disabled={!selectedUserId || addMember.isPending}
						onClick={() => addMember.mutate()}
					>
						<UserPlus data-icon="inline-start" />
						{addMember.isPending
							? t("account.mailboxes.adding")
							: t("mailbox.addUser")}
					</Button>
				</div>
				{addMember.isError && (
					<p className="text-sm text-destructive">
						{addMember.error instanceof Error
							? addMember.error.message
							: t("mailbox.accountAddFailed")}
					</p>
				)}
			</CardContent>
		</Card>
	);
	const renderMailboxAliases = () => (
		<Card>
			<CardHeader>
				<CardTitle>{t("mailbox.aliases")}</CardTitle>
				<CardDescription>{t("mailbox.aliasesDescription")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{aliases.isLoading && <Skeleton className="h-12 w-full rounded-lg" />}
				{(aliases.data?.aliases ?? []).map((alias) => (
					<Item key={alias.id} variant="muted" size="sm">
						<ItemMedia>
							<AtSign className="size-4 text-muted-foreground/70" />
						</ItemMedia>
						<ItemContent className="min-w-0">
							<p className="truncate font-sans text-sm font-medium">
								{alias.localPart}@{alias.hostname}
							</p>
						</ItemContent>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={t("mailbox.removeAddress", {
								address: `${alias.localPart}@${alias.hostname}`,
							})}
							disabled={removeAlias.isPending}
							onClick={() => removeAlias.mutate(alias.id)}
							className="text-destructive"
						>
							<Trash2 />
						</Button>
					</Item>
				))}
				{aliases.data && aliases.data.aliases.length === 0 && (
					<p className="text-sm text-muted-foreground">
						{t("mailbox.noAliases")}
					</p>
				)}
				{aliases.isError && (
					<p className="text-sm text-destructive">
						{aliases.error instanceof Error
							? aliases.error.message
							: t("mailbox.aliasesLoadFailed")}
					</p>
				)}
				<div className="flex gap-2">
					<Input
						aria-label={t("mailbox.aliases")}
						value={aliasLocalPart}
						onChange={(event) => setAliasLocalPart(event.target.value)}
						placeholder={t("mailbox.aliasPlaceholder")}
						className="min-w-0 flex-1"
						disabled={addAlias.isPending}
					/>
					<NativeSelect
						aria-label={t("accounts.domain")}
						value={aliasDomainId}
						onChange={(event) => setEditedAliasDomain(event.target.value)}
						containerClassName="min-w-0 flex-1"
						disabled={addAlias.isPending}
					>
						{(aliases.data?.availableDomains ?? []).map((domain) => (
							<option key={domain.id} value={domain.id}>
								@{domain.hostname}
							</option>
						))}
					</NativeSelect>
					<Button
						type="button"
						disabled={
							!aliasLocalPart.trim() || !aliasDomainId || addAlias.isPending
						}
						onClick={() => addAlias.mutate()}
					>
						<AtSign data-icon="inline-start" />
						{addAlias.isPending
							? t("account.mailboxes.adding")
							: t("mailbox.addAlias")}
					</Button>
				</div>
				{addAlias.isError && (
					<p className="text-sm text-destructive">
						{addAlias.error instanceof Error
							? addAlias.error.message
							: t("mailbox.aliasAddFailed")}
					</p>
				)}
				{removeAlias.isError && (
					<p className="text-sm text-destructive">
						{removeAlias.error instanceof Error
							? removeAlias.error.message
							: t("mailbox.aliasRemoveFailed")}
					</p>
				)}
			</CardContent>
		</Card>
	);
	const renderSharedAccess = () => (
		<Card>
			<CardHeader>
				<CardTitle>{t("mailbox.account")}</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{mailbox.data ? (
					<MailboxAvatarForm
						mailboxId={mailbox.data.id}
						hasAvatar={!!mailbox.data.hasAvatar}
						name={mailbox.data.displayName || mailbox.data.localPart}
					/>
				) : (
					<Skeleton className="size-24 rounded-full" />
				)}

				<Field>
					<FieldLabel htmlFor="displayName">{t("common.name")}</FieldLabel>
					<Input
						id="displayName"
						value={displayName}
						onChange={(event) => setEditedName(event.target.value)}
						placeholder={
							mailbox.data?.localPart ?? t("mailboxes.namePlaceholder")
						}
						disabled={mailbox.isLoading || updateName.isPending}
					/>
				</Field>
				<FieldLabel>
					<Field orientation="horizontal">
						<Checkbox
							checked={useAllDomains}
							onCheckedChange={(checked) =>
								setEditedAllDomains(checked === true)
							}
							disabled={mailbox.isLoading || updateName.isPending}
						/>
						<FieldContent>
							<FieldTitle>{t("aliases.useAll")}</FieldTitle>
							<FieldDescription>{t("mailbox.useAllHint")}</FieldDescription>
						</FieldContent>
					</Field>
				</FieldLabel>
				{updateName.isError && (
					<p className="text-sm text-destructive">
						{updateName.error instanceof Error
							? updateName.error.message
							: t("mailbox.updateFailed")}
					</p>
				)}
				{updateName.isSuccess && (
					<p className="text-sm text-success">{t("mailbox.saved")}</p>
				)}
				<Button
					onClick={() => updateName.mutate()}
					disabled={mailbox.isLoading || updateName.isPending}
				>
					<Save data-icon="inline-start" />
					{updateName.isPending
						? t("common.saving")
						: t("settings.mailbox.saveChanges")}
				</Button>
			</CardContent>
		</Card>
	);
	const renderMailboxSettings = () => (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("mailbox.title")}</PageTitle>
					{address ? (
						<PageDescription>
							<span className="block truncate font-sans">{address}</span>
						</PageDescription>
					) : (
						<Skeleton className="h-4 w-52" />
					)}
				</PageHeaderText>
				<PageHeaderActions>
					{mailbox.data?.type === "shared" && (
						<Badge variant="secondary">{t("mailboxes.shared")}</Badge>
					)}
					{mailbox.data?.isPrimary && (
						<Badge variant="secondary">{t("mailbox.primary")}</Badge>
					)}
				</PageHeaderActions>
			</PageHeader>

			{mailbox.isError && (
				<Alert variant="error">
					<AlertDescription>
						{mailbox.error instanceof Error
							? mailbox.error.message
							: t("mailbox.loadFailed")}
					</AlertDescription>
				</Alert>
			)}

			{renderSharedAccess()}

			{renderMailboxAliases()}

			{mailbox.data?.type === "shared" && renderMailboxAccount()}
			<Card>
				<CardHeader>
					<CardTitle>{t("mailbox.dangerZone")}</CardTitle>
					<CardDescription>
						{t("mailbox.dangerDescription", {
							address: address || t("mailbox.thisAddress"),
						})}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{removeMailbox.isError && (
						<Alert variant="error" className="mb-4">
							<AlertDescription>
								{removeMailbox.error instanceof Error
									? removeMailbox.error.message
									: t("mailbox.deleteFailed")}
							</AlertDescription>
						</Alert>
					)}
					<Button
						type="button"
						variant="destructive"
						disabled={!mailbox.data || removeMailbox.isPending}
						onClick={async () => {
							if (!(await confirm(t("mailbox.deleteConfirm", { address })))) {
								return;
							}
							removeMailbox.mutate();
						}}
					>
						<Trash2 data-icon="inline-start" />
						{removeMailbox.isPending
							? t("mailbox.deleting")
							: t("mailbox.delete")}
					</Button>
				</CardContent>
			</Card>

			{/*
      <Card>
        <CardHeader className="py-0">
          <CardTitle>Address</CardTitle>
          <CardDescription>
            The email address, username, and domain are managed as routing
            resources.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </p>
            <p className="truncate font-sans text-sm text-foreground">
              {address || "-"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Username
            </p>
            <p className="truncate font-sans text-sm text-foreground">
              {mailbox.data?.localPart ?? "-"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Domain
            </p>
            <p className="truncate font-sans text-sm text-foreground">
              {mailbox.data?.hostname ?? "-"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Routing
            </p>
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Mail className="size-4 text-muted-foreground/70" />
              Cloudflare Email Routing
            </p>
          </div>
        </CardContent>
      </Card> */}
		</div>
	);
	return renderMailboxSettings();
}

export default function MailboxSettingsWithConfirmation() {
	const { id } = useParams<{ id: string }>();
	return (
		<AdminConfirmationProvider>
			<MailboxSettingsPage key={id} />
		</AdminConfirmationProvider>
	);
}
