"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
} from "@/components/ui/item";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { runAsyncAction } from "@/lib/async-cleanup";

import { AdminRowActions } from "../../../admin-row-actions";
import type { ManagedAccount, ManagedDomain, ManagedMailbox } from "../types";
import {
	addManagedMailbox,
	fetchManagedAccount,
	fetchManagedDomains,
	fetchManagedMailboxes,
	removeManagedMailbox,
} from "../utils";

export default function AccountMailboxesPage() {
	const { t } = useLanguage();
	const { id } = useParams<{ id: string }>();
	const [account, setAccount] = useState<ManagedAccount | null>(null);
	const [mailboxes, setMailboxes] = useState<ManagedMailbox[]>([]);
	const [domains, setDomains] = useState<ManagedDomain[]>([]);
	const [localPart, setLocalPart] = useState("");
	const [domainId, setDomainId] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const load = useCallback(async () => {
		const [nextAccount, nextMailboxes, nextDomains] = await Promise.all([
			fetchManagedAccount(id),
			fetchManagedMailboxes(id),
			fetchManagedDomains(),
		]);
		setAccount(nextAccount);
		setMailboxes(nextMailboxes);
		setDomains(nextDomains);
		setDomainId((current) => current || nextDomains[0]?.id || "");
	}, [id]);

	useEffect(() => {
		runAsyncAction(load, (failure) =>
			setMessage(
				failure instanceof Error
					? failure.message
					: t("account.mailboxes.loadFailed")
			)
		);
	}, [load, t]);

	function addMailbox(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!account) {
			return;
		}
		setSaving(true);
		setMessage(null);
		return runAsyncAction(
			async () => {
				await addManagedMailbox(account, { domainId, localPart });
				setLocalPart("");
				await load();
			},
			(failure) => {
				setMessage(
					failure instanceof Error
						? failure.message
						: t("account.mailboxes.addFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	async function removeMailbox(mailboxId: string) {
		setMessage(null);
		try {
			await removeManagedMailbox(mailboxId);
			await load();
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: t("account.mailboxes.removeFailed")
			);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("account.mailboxes.title")}</PageTitle>
					<PageDescription>
						{t("account.mailboxes.manage", {
							name: account?.name ?? t("account.password.thisAccount"),
						})}
					</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<Card>
				<CardHeader>
					<CardTitle>{t("account.mailboxes.current")}</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="flex flex-col gap-2">
						{mailboxes.map((mailbox) => (
							<li key={mailbox.id}>
								<Item variant="muted" size="sm">
									<ItemContent className="min-w-0">
										<p className="truncate text-sm font-medium">
											{mailbox.displayName || mailbox.localPart}
										</p>
										<ItemDescription>
											<span className="block truncate">
												{mailbox.localPart}@{mailbox.hostname}
											</span>
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Button asChild variant="ghost" size="sm">
											<Link
												href={`/mailboxes/${mailbox.id}`}
												aria-label={`${t("mailbox.title")}: ${mailbox.localPart}@${mailbox.hostname}`}
											>
												{t("mailbox.title")}
											</Link>
										</Button>
										<AdminRowActions
											title={t("account.mailboxes.removeInbox")}
											description={t("mailbox.deleteConfirm", {
												address: `${mailbox.localPart}@${mailbox.hostname}`,
											})}
											confirmLabel={t("account.mailboxes.removeInbox")}
											onConfirm={() => removeMailbox(mailbox.id)}
										/>
									</ItemActions>
								</Item>
							</li>
						))}
						{account && mailboxes.length === 0 && (
							<p className="text-sm text-muted-foreground">
								{t("account.mailboxes.none")}
							</p>
						)}
					</ul>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t("account.mailboxes.addTitle")}</CardTitle>
					<CardDescription>
						{t("account.mailboxes.addDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={addMailbox} className="flex flex-col gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<Field className="min-w-0">
								<FieldLabel htmlFor="inbox-name">
									{t("account.mailboxes.inboxName")}
								</FieldLabel>
								<Input
									id="inbox-name"
									value={localPart}
									onChange={(event) => setLocalPart(event.target.value)}
									placeholder={t("account.mailboxes.inboxPlaceholder")}
									disabled={!account || saving}
									maxLength={64}
									required
								/>
							</Field>
							<Field className="min-w-0">
								<FieldLabel htmlFor="inbox-domain">
									{t("account.mailboxes.domain")}
								</FieldLabel>
								<NativeSelect
									id="inbox-domain"
									value={domainId}
									onChange={(event) => setDomainId(event.target.value)}
									containerClassName="w-full min-w-0"
									disabled={!account || domains.length === 0 || saving}
									required
								>
									{domains.length === 0 && (
										<option value="">{t("account.mailboxes.noDomains")}</option>
									)}
									{domains.map((domain) => (
										<option key={domain.id} value={domain.id}>
											{domain.hostname}
										</option>
									))}
								</NativeSelect>
							</Field>
						</div>
						{domainId && (
							<p className="text-sm break-all text-muted-foreground">
								{t("account.mailboxes.address")}{" "}
								<span className="font-medium text-foreground">
									{localPart || t("account.mailboxes.inboxPlaceholder")}@
									{domains.find((domain) => domain.id === domainId)?.hostname}
								</span>
							</p>
						)}
						<Button
							type="submit"
							disabled={!account || !domainId || !localPart.trim() || saving}
						>
							<Plus data-icon="inline-start" />
							{saving
								? t("account.mailboxes.adding")
								: t("account.mailboxes.add")}
						</Button>
					</form>
				</CardContent>
			</Card>
			{message && (
				<output className="text-sm text-muted-foreground">{message}</output>
			)}
		</div>
	);
}
