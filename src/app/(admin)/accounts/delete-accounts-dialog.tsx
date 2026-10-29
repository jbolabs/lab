"use client";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { ACCOUNT_RESTORE_DAYS } from "@/lib/accounts/deletion-utils";
import { runAsyncAction } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

import type { DeleteAccountsDialogProps } from "./accounts-table-types";

export function DeleteAccountsDialog({
	open,
	onOpenChange,
	accounts,
	candidates,
	onDeleted,
}: DeleteAccountsDialogProps) {
	const { t } = useLanguage();
	const [transferToId, setTransferToId] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const doomed = new Set(accounts.map((account) => account.id));
	const recipients = candidates.filter(
		(account) =>
			!doomed.has(account.id) && !account.disabled && !account.deletedAt
	);

	function confirm() {
		setDeleting(true);
		setMessage(null);
		return runAsyncAction(
			async () => {
				const response = await authFetch("/api/accounts", {
					body: JSON.stringify({
						ids: accounts.map((account) => account.id),
						transferToId: transferToId || null,
					}),
					headers: { "Content-Type": "application/json" },
					method: "DELETE",
				});
				const data = (await response.json()) as { error?: string };
				if (!response.ok) {
					throw new Error(data.error ?? t("accounts.deleteFailed"));
				}
				setTransferToId("");
				onDeleted();
			},
			(failure) => {
				setMessage(
					failure instanceof Error
						? failure.message
						: t("accounts.deleteFailed")
				);
			},
			() => {
				setDeleting(false);
			}
		);
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!deleting) {
					setMessage(null);
					onOpenChange(next);
				}
			}}
		>
			<AlertDialogContent className="max-h-[calc(100dvh-4rem)] w-[min(520px,calc(100vw-32px))] overflow-y-auto">
				<AlertDialogHeader>
					<AlertDialogTitle>
						{t("accounts.deleteTitle", { count: accounts.length })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{t("accounts.deleteDescription", { days: ACCOUNT_RESTORE_DAYS })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<ul className="flex flex-col gap-1 text-sm text-foreground/80">
					{accounts.map((account) => (
						<li key={account.id} className="truncate">
							{account.name}{" "}
							<span className="text-muted-foreground">{account.email}</span>
						</li>
					))}
				</ul>
				<Field>
					<FieldLabel htmlFor="transfer-account">
						{t("accounts.transferLabel")}
					</FieldLabel>
					<NativeSelect
						id="transfer-account"
						value={transferToId}
						onChange={(event) => setTransferToId(event.target.value)}
						disabled={deleting}
						containerClassName="w-full"
					>
						<option value="">{t("accounts.transferNone")}</option>
						{recipients.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name} ({account.email})
							</option>
						))}
					</NativeSelect>
					<FieldDescription>{t("accounts.transferHint")}</FieldDescription>
				</Field>
				{message && (
					<p role="alert" className="text-sm text-destructive">
						{message}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button
						variant="outline"
						disabled={deleting}
						onClick={() => onOpenChange(false)}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant="destructive"
						disabled={deleting || !accounts.length}
						onClick={confirm}
					>
						{deleting ? t("accounts.deleting") : t("accounts.confirmDelete")}
					</Button>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	);
}
