"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";
import {
	useCurrentUser,
	clearCurrentUserCache,
} from "@/hooks/use-current-user";
import { runAsyncAction } from "@/lib/async-cleanup";

import type { ManagedAccount } from "../types";
import {
	fetchManagedAccount,
	fetchTransferCandidates,
	saveManagedAccount,
	transferPrimaryAdmin,
} from "../utils";
import type { TransferCandidate } from "../utils";

export default function AccountPermissionsPage() {
	const { t } = useLanguage();
	const { id } = useParams<{ id: string }>();
	const currentUser = useCurrentUser();
	const [account, setAccount] = useState<ManagedAccount | null>(null);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
	const [transferTargetId, setTransferTargetId] = useState("");
	const [transferOpen, setTransferOpen] = useState(false);
	const [transferring, setTransferring] = useState(false);

	useEffect(() => {
		runAsyncAction(
			async () => {
				const result0 = await fetchManagedAccount(id);
				setAccount(result0);
			},
			(failure) =>
				setMessage(
					failure instanceof Error
						? failure.message
						: t("account.permissions.loadFailed")
				)
		);
	}, [id, t]);

	const isPrimary = !!account?.canChangeRole;
	const transferTarget = useMemo(
		() =>
			candidates.find((candidate) => candidate.id === transferTargetId) ?? null,
		[candidates, transferTargetId]
	);

	useEffect(() => {
		if (!isPrimary) {
			return;
		}
		runAsyncAction(
			async () => {
				const result0 = await fetchTransferCandidates();
				return await ((list: typeof result0) =>
					setCandidates(
						list.filter(
							(candidate) =>
								candidate.id !== currentUser?.id && !candidate.disabled
						)
					))(result0);
			},
			() => {
				/* empty */
			}
		);
	}, [isPrimary, currentUser?.id]);

	function savePermissions() {
		if (!account) {
			return;
		}
		setSaving(true);
		setMessage(null);
		return runAsyncAction(
			async () => {
				await saveManagedAccount(account);
				setMessage(t("account.permissions.updated"));
			},
			(failure) => {
				setMessage(
					failure instanceof Error
						? failure.message
						: t("account.permissions.updateFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	async function confirmTransfer() {
		if (!transferTarget) {
			return;
		}
		setTransferring(true);
		setMessage(null);
		try {
			await transferPrimaryAdmin(transferTarget.id);
			clearCurrentUserCache();
			setTransferOpen(false);
			// A full reload drops the stale cached session so the navigation reflects the new role.
			window.location.assign(`/accounts/${transferTarget.id}/permissions`);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: t("account.permissions.transferFailed")
			);
			setTransferring(false);
		}
	}

	const editable = !!account?.editable;

	const renderPermissionsTable = () => (
		<Table className="w-full table-fixed text-left [&_td]:whitespace-normal">
			<TableHeader className="">
				<TableRow>
					<TableHead scope="col" className="">
						{t("account.permissions.permission")}
					</TableHead>
					<TableHead scope="col" className="w-28 text-center">
						{t("account.permissions.allowed")}
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody className="">
				<TableRow>
					<TableCell className="">
						<p className="text-sm font-semibold text-foreground">
							{t("account.permissions.manageMailboxes")}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("account.permissions.manageMailboxesHint")}
						</p>
					</TableCell>
					<TableCell className="text-center">
						<Checkbox
							aria-label={t("account.permissions.allowMailboxes")}
							checked={account?.canManageMailboxes ?? false}
							disabled={!account || !editable}
							onCheckedChange={(checked) =>
								account &&
								setAccount({
									...account,
									canManageMailboxes: checked === true,
								})
							}
						/>
					</TableCell>
				</TableRow>
				<TableRow>
					<TableCell className="">
						<p className="text-sm font-semibold text-foreground">
							{t("account.permissions.manageDomains")}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("account.permissions.manageDomainsHint")}
						</p>
					</TableCell>
					<TableCell className="text-center">
						<Checkbox
							aria-label={t("account.permissions.allowDomains")}
							checked={account?.canManageDomains ?? false}
							disabled={!account || !account.canChangeRole}
							onCheckedChange={(checked) =>
								account &&
								setAccount({
									...account,
									canManageDomains: checked === true,
								})
							}
						/>
					</TableCell>
				</TableRow>
				<TableRow>
					<TableCell className="">
						<p className="text-sm font-semibold text-foreground">
							{t("account.permissions.manageUsers")}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("account.permissions.manageUsersHint")}
						</p>
					</TableCell>
					<TableCell className="text-center">
						<Checkbox
							aria-label={t("account.permissions.allowUsers")}
							checked={account?.canManageUsers ?? false}
							disabled={!account || !account.canChangeRole}
							onCheckedChange={(checked) =>
								account &&
								setAccount({ ...account, canManageUsers: checked === true })
							}
						/>
					</TableCell>
				</TableRow>
			</TableBody>
		</Table>
	);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("account.permissions.title")}</PageTitle>
					<PageDescription>
						{t("account.permissions.description")}
					</PageDescription>
				</PageHeaderText>
			</PageHeader>
			{account?.isPrimaryAdmin && (
				<Alert variant="warning">
					<AlertTitle>{t("account.permissions.primaryAdmin")}</AlertTitle>
					<AlertDescription>
						{t("account.permissions.primaryNote")}
					</AlertDescription>
				</Alert>
			)}
			<Field>
				<FieldLabel htmlFor="account-role">{t("accounts.role")}</FieldLabel>
				<NativeSelect
					id="account-role"
					value={account?.role ?? "user"}
					disabled={!account || saving || !account.canChangeRole}
					containerClassName="w-full sm:w-64"
					onChange={(event) =>
						account &&
						setAccount({
							...account,
							role: event.target.value === "admin" ? "admin" : "user",
						})
					}
				>
					<option value="user">{t("accounts.roleUser")}</option>
					<option value="admin">{t("accounts.roleAdmin")}</option>
				</NativeSelect>
				<FieldDescription>
					{account?.canChangeRole
						? t("account.permissions.admins")
						: t("account.permissions.onlyPrimaryRoles")}
				</FieldDescription>
			</Field>
			<div className="overflow-hidden rounded-lg bg-card">
				{renderPermissionsTable()}
			</div>
			{editable && (
				<Button onClick={() => savePermissions()} disabled={saving}>
					{saving ? t("common.saving") : t("account.permissions.save")}
				</Button>
			)}
			{isPrimary && (
				<Card>
					<CardHeader>
						<CardTitle>{t("account.permissions.transferTitle")}</CardTitle>
						<CardDescription>
							{t("account.permissions.transferHint")}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 sm:flex-row">
						<NativeSelect
							aria-label={t("account.permissions.selectNext")}
							value={transferTargetId}
							containerClassName="w-full sm:max-w-sm"
							onChange={(event) => setTransferTargetId(event.target.value)}
						>
							<option value="">{t("account.permissions.selectAccount")}</option>
							{candidates.map((candidate) => (
								<option key={candidate.id} value={candidate.id}>
									{candidate.email} — {candidate.name}
								</option>
							))}
						</NativeSelect>
						<Button
							variant="outline"
							disabled={!transferTarget}
							onClick={() => setTransferOpen(true)}
						>
							{t("account.permissions.transferTitle")}
						</Button>
					</CardContent>
				</Card>
			)}
			{message && (
				<output className="text-sm text-muted-foreground">{message}</output>
			)}

			<Dialog open={transferOpen} onOpenChange={setTransferOpen}>
				<DialogContent className="max-h-[calc(100dvh-4rem)] w-[min(420px,calc(100vw-32px))] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{t("account.permissions.transferQuestion")}
						</DialogTitle>
						<DialogDescription>
							{t("account.permissions.transferWarning")}
						</DialogDescription>
					</DialogHeader>
					{transferTarget && (
						<div className="flex items-center gap-4 rounded-lg border border-border p-4">
							<span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground">
								{transferTarget.name.charAt(0).toUpperCase()}
								{transferTarget.hasAvatar && (
									<ProgressiveAvatarImage
										src={`/api/accounts/${transferTarget.id}/avatar`}
										alt=""
										className="absolute inset-0 size-full object-cover"
									/>
								)}
							</span>
							<span className="min-w-0">
								<span className="block truncate font-semibold text-foreground">
									{transferTarget.name}
								</span>
								<span className="block truncate text-sm text-muted-foreground">
									{transferTarget.email}
								</span>
							</span>
						</div>
					)}
					<div className="flex justify-end gap-2">
						<DialogClose
							render={<Button variant="outline" disabled={transferring} />}
						>
							{t("common.cancel")}
						</DialogClose>
						<Button
							disabled={transferring || !transferTarget}
							onClick={() => confirmTransfer()}
						>
							{transferring
								? t("account.permissions.transferring")
								: t("account.permissions.confirmTransfer")}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
