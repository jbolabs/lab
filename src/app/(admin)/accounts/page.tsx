"use client";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { FieldSet, Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupInput,
	InputGroupAddon,
	InputGroupText,
} from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import { runAsyncAction } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { defaultTranslator } from "@/lib/i18n/utils";

import {
	AdminFormPanel as Dialog,
	AdminFormPanelContent as DialogContent,
	AdminFormPanelDescription as DialogDescription,
	AdminFormPanelHeader as DialogHeader,
	AdminFormPanelTitle as DialogTitle,
} from "../admin-form-panel";
import { AccountAliases } from "./account-aliases";
import { AccountsTable } from "./accounts-table";
import { DeleteAccountsDialog } from "./delete-accounts-dialog";
import type {
	Account,
	AccountAliasDraft,
	AccountResponse,
	Domain,
} from "./types";

async function fetchAccounts(): Promise<AccountResponse> {
	const response = await authFetch("/api/accounts");
	const data = (await response.json()) as AccountResponse;
	if (!response.ok) {
		throw new Error(data.error ?? defaultTranslator("accounts.loadFailed"));
	}
	return data;
}

export default function AccountsPage() {
	const { t } = useLanguage();
	const currentUser = useCurrentUser();
	const canManage =
		!!currentUser && (currentUser.isPrimaryAdmin || currentUser.canManageUsers);
	const canChooseRole = !!currentUser?.isPrimaryAdmin;
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [domains, setDomains] = useState<Domain[]>([]);
	const [username, setUsername] = useState("");
	const [domainId, setDomainId] = useState("");
	const [role, setRole] = useState<"admin" | "user">("user");
	const [password, setPassword] = useState("");
	const [useAllDomains, setUseAllDomains] = useState(false);
	const [aliases, setAliases] = useState<AccountAliasDraft[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [restoringId, setRestoringId] = useState<string | null>(null);

	async function loadAccounts() {
		const data = await fetchAccounts();
		setAccounts(data.accounts ?? []);
	}

	useEffect(() => {
		runAsyncAction(
			async () => {
				const list = await fetchAccounts();
				setAccounts(list.accounts ?? []);
				const response = await authFetch("/api/domains");
				const data = (await response.json()) as {
					domains?: Domain[];
					error?: string;
				};
				if (!response.ok) {
					throw new Error(data.error ?? t("accounts.domainsFailed"));
				}
				setDomains(data.domains ?? []);
				setDomainId(data.domains?.[0]?.id ?? "");
			},
			(failure) => {
				const text =
					failure instanceof Error ? failure.message : t("accounts.loadFailed");
				setMessage(text);
			},
			() => setLoading(false)
		);
	}, [t]);

	function createAccount(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setMessage(null);
		return runAsyncAction(
			async () => {
				const response = await authFetch("/api/accounts", {
					body: JSON.stringify({
						aliases: aliases.map(({ domainId: aliasDomainId, localPart }) => ({
							domainId: aliasDomainId,
							localPart,
						})),
						domainId,
						password,
						role,
						useAllDomains,
						username,
					}),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				});
				const data = (await response.json()) as AccountResponse;
				if (!response.ok) {
					throw new Error(
						typeof data.error === "string"
							? data.error
							: t("accounts.checkDetails")
					);
				}
				setUsername("");
				setPassword("");
				setUseAllDomains(false);
				setAliases([]);
				setCreateOpen(false);
				await loadAccounts();
			},
			(failure) => {
				setMessage(
					failure instanceof Error
						? failure.message
						: t("accounts.createFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	function restoreAccount(account: Account) {
		setRestoringId(account.id);
		setMessage(null);
		return runAsyncAction(
			async () => {
				const response = await authFetch(
					`/api/accounts/${account.id}/restore`,
					{
						method: "POST",
					}
				);
				const data = (await response.json()) as { error?: string };
				if (!response.ok) {
					throw new Error(data.error ?? t("accounts.restoreFailed"));
				}
				await loadAccounts();
			},
			(failure) => {
				setMessage(
					failure instanceof Error
						? failure.message
						: t("accounts.restoreFailed")
				);
			},
			() => {
				setRestoringId(null);
			}
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader className="items-center">
				<PageHeaderText>
					<PageTitle>{t("accounts.title")}</PageTitle>
					<PageDescription>{t("accounts.description")}</PageDescription>
				</PageHeaderText>
				{canManage && (
					<PageHeaderActions>
						<Button float="mobile" onClick={() => setCreateOpen(true)}>
							<Plus data-icon="inline-start" />
							{t("accounts.new")}
						</Button>
					</PageHeaderActions>
				)}
			</PageHeader>
			{message && !createOpen && (
				<p role="alert" className="text-sm text-destructive">
					{message}
				</p>
			)}
			<div className="relative">
				<AccountsTable
					accounts={accounts}
					currentUserId={currentUser?.id}
					isPrimaryAdmin={!!currentUser?.isPrimaryAdmin}
					loading={loading}
					selected={selected}
					onSelectedChange={setSelected}
					onDeleteSelected={() => setDeleteOpen(true)}
					onRestore={restoreAccount}
					restoringId={restoringId}
				/>
			</div>
			<DeleteAccountsDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				accounts={accounts.filter((account) => selected.has(account.id))}
				candidates={accounts}
				onDeleted={async () => {
					setDeleteOpen(false);
					setSelected(new Set());
					await loadAccounts();
				}}
			/>
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("accounts.addTitle")}</DialogTitle>
						<DialogDescription>
							{t("accounts.addDescription")}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={createAccount}>
						<FieldSet disabled={saving}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="account-username">
										{t("auth.email")}
									</FieldLabel>
									<div className="flex min-w-0 gap-2">
										<InputGroup className="flex-1">
											<InputGroupInput
												id="account-username"
												value={username}
												onChange={(event) => setUsername(event.target.value)}
												placeholder={t("accounts.username")}
												required
											/>
											<InputGroupAddon align="inline-end">
												<InputGroupText>@</InputGroupText>
											</InputGroupAddon>
										</InputGroup>
										<NativeSelect
											aria-label={t("accounts.domain")}
											value={domainId}
											onChange={(event) => setDomainId(event.target.value)}
											containerClassName="w-40 min-w-0 shrink-0"
											required
										>
											<option value="">{t("accounts.selectDomain")}</option>
											{domains.map((domain) => (
												<option key={domain.id} value={domain.id}>
													{domain.hostname}
												</option>
											))}
										</NativeSelect>
									</div>
								</Field>
								<Field>
									<FieldLabel htmlFor="account-password">
										{t("auth.password")}
									</FieldLabel>
									<Input
										id="account-password"
										type="password"
										minLength={8}
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										required
									/>
								</Field>
								{canChooseRole && (
									<Field>
										<FieldLabel htmlFor="account-role">
											{t("accounts.role")}
										</FieldLabel>
										<NativeSelect
											id="account-role"
											value={role}
											onChange={(event) =>
												setRole(event.target.value as "admin" | "user")
											}
											containerClassName="w-full"
										>
											<option value="user">{t("accounts.roleUser")}</option>
											<option value="admin">{t("accounts.roleAdmin")}</option>
										</NativeSelect>
									</Field>
								)}
								<AccountAliases
									domains={domains}
									domainId={domainId}
									username={username}
									useAllDomains={useAllDomains}
									onUseAllDomainsChange={setUseAllDomains}
									aliases={aliases}
									onAliasesChange={setAliases}
								/>
								{message && (
									<p role="alert" className="text-sm text-destructive">
										{message}
									</p>
								)}
								<Button type="submit" disabled={saving || !domainId}>
									{saving ? t("accounts.creating") : t("accounts.create")}
								</Button>
							</FieldGroup>
						</FieldSet>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
