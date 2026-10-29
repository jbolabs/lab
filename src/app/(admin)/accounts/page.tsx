"use client";
import { FieldSet, Field, FieldLabel } from "@/components/ui/field";

import { mobilePrimaryActionClass } from "../admin-ui-utils";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AdminFormPanel as Dialog, AdminFormPanelContent as DialogContent, AdminFormPanelDescription as DialogDescription, AdminFormPanelHeader as DialogHeader, AdminFormPanelTitle as DialogTitle } from "../admin-form-panel";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { authFetch } from "@/lib/auth/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { defaultTranslator } from "@/lib/i18n/utils";
import { AccountAliases } from "./account-aliases";
import { AccountsTable } from "./accounts-table";
import { DeleteAccountsDialog } from "./delete-accounts-dialog";
import type { Account, AccountAliasDraft, AccountResponse, Domain } from "./types";

async function fetchAccounts(): Promise<AccountResponse> {
	const response = await authFetch("/api/accounts");
	const data = (await response.json()) as AccountResponse;
	if (!response.ok) throw new Error(data.error ?? defaultTranslator("accounts.loadFailed"));
	return data;
}

export default function AccountsPage() {
	const { t } = useLanguage();
	const currentUser = useCurrentUser();
	const canManage = !!currentUser && (currentUser.isPrimaryAdmin || currentUser.canManageUsers);
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
		fetchAccounts().then(async (list) => {
			setAccounts(list.accounts ?? []);
			const response = await authFetch("/api/domains");
			const data = (await response.json()) as { domains?: Domain[]; error?: string };
			if (!response.ok) throw new Error(data.error ?? t("accounts.domainsFailed"));
			setDomains(data.domains ?? []);
			setDomainId(data.domains?.[0]?.id ?? "");
		}).catch((error) => {
			const text = error instanceof Error ? error.message : t("accounts.loadFailed");
			setMessage(text);
		}).finally(() => setLoading(false));
	}, []);

	async function createAccount(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setMessage(null);
		try {
			const response = await authFetch("/api/accounts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, domainId, password, role, useAllDomains, aliases: aliases.map(({ domainId, localPart }) => ({ domainId, localPart })) }),
			});
			const data = (await response.json()) as AccountResponse;
			if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : t("accounts.checkDetails"));
			setUsername("");
			setPassword("");
			setUseAllDomains(false);
			setAliases([]);
			setCreateOpen(false);
			await loadAccounts();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : t("accounts.createFailed"));
		} finally {
			setSaving(false);
		}
	}

	async function restoreAccount(account: Account) {
		setRestoringId(account.id);
		setMessage(null);
		try {
			const response = await authFetch(`/api/accounts/${account.id}/restore`, { method: "POST" });
			const data = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(data.error ?? t("accounts.restoreFailed"));
			await loadAccounts();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : t("accounts.restoreFailed"));
		} finally {
			setRestoringId(null);
		}
	}

	return <div className="flex flex-col gap-6">
		<div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("accounts.title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("accounts.description")}</p></div>{canManage && <Button className={mobilePrimaryActionClass} onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />{t("accounts.new")}</Button>}</div>
		{message && !createOpen && <p role="alert" className="text-sm text-red-600">{message}</p>}
		<div className="relative">
			<AccountsTable accounts={accounts} currentUserId={currentUser?.id} isPrimaryAdmin={!!currentUser?.isPrimaryAdmin} loading={loading} selected={selected} onSelectedChange={setSelected} onDeleteSelected={() => setDeleteOpen(true)} onRestore={restoreAccount} restoringId={restoringId} />
		</div>
		<DeleteAccountsDialog open={deleteOpen} onOpenChange={setDeleteOpen} accounts={accounts.filter((account) => selected.has(account.id))} candidates={accounts} onDeleted={async () => { setDeleteOpen(false); setSelected(new Set()); await loadAccounts(); }} />
		<Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>{t("accounts.addTitle")}</DialogTitle><DialogDescription>{t("accounts.addDescription")}</DialogDescription></DialogHeader><form onSubmit={createAccount}><FieldSet disabled={saving} className="flex flex-col gap-4">
			<Field className="flex flex-col gap-2"><FieldLabel htmlFor="account-username">{t("auth.email")}</FieldLabel><InputGroup><InputGroupInput id="account-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={t("accounts.username")}  required /><InputGroupAddon align="inline-end"><InputGroupText>@</InputGroupText><NativeSelect aria-label={t("accounts.domain")} value={domainId} onChange={(event) => setDomainId(event.target.value)} containerClassName="w-36 shrink-0" className="border-0 shadow-none" required><option value="">{t("accounts.selectDomain")}</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.hostname}</option>)}</NativeSelect></InputGroupAddon></InputGroup></Field>
			<Field className="flex flex-col gap-2"><FieldLabel htmlFor="account-password">{t("auth.password")}</FieldLabel><Input id="account-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
			{canChooseRole && <Field className="flex flex-col gap-2"><FieldLabel htmlFor="account-role">{t("accounts.role")}</FieldLabel><NativeSelect id="account-role" value={role} onChange={(event) => setRole(event.target.value as "admin" | "user")} containerClassName="h-10 w-full bg-card px-0" className="px-3 text-sm"><option value="user">{t("accounts.roleUser")}</option><option value="admin">{t("accounts.roleAdmin")}</option></NativeSelect></Field>}
			<AccountAliases domains={domains} domainId={domainId} username={username} useAllDomains={useAllDomains} onUseAllDomainsChange={setUseAllDomains} aliases={aliases} onAliasesChange={setAliases} />
			{message && <p role="alert" className="text-sm text-red-600">{message}</p>}<Button type="submit" disabled={saving || !domainId}>{saving ? t("accounts.creating") : t("accounts.create")}</Button>
		</FieldSet></form></DialogContent></Dialog>
	</div>;
}
