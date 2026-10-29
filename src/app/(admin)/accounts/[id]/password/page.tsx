"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { runAsyncAction } from "@/lib/async-cleanup";

import type { ManagedAccount } from "../types";
import { fetchManagedAccount } from "../utils";
import { saveAccountPassword } from "./utils";

export default function AccountPasswordPage() {
	const { t } = useLanguage();
	const { id } = useParams<{ id: string }>();
	const [account, setAccount] = useState<ManagedAccount | null>(null);
	const [password, setPassword] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		runAsyncAction(
			async () => {
				const result0 = await fetchManagedAccount(id);
				setAccount(result0);
			},
			(failure) =>
				setMessage(
					failure instanceof Error ? failure.message : t("account.loadFailed")
				)
		);
	}, [id, t]);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("account.password.title")}</PageTitle>
					<PageDescription>
						{t("account.password.resetFor", {
							name: account?.name ?? t("account.password.thisAccount"),
						})}
					</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<form
				onSubmit={(event) =>
					saveAccountPassword({
						account,
						event,
						password,
						setMessage,
						setPassword,
						setSaving,
						t,
					})
				}
				className="flex flex-col gap-6"
			>
				{account && !account.editable ? (
					<p className="text-sm text-muted-foreground">
						{t("account.password.onlyPrimary")}
					</p>
				) : (
					<>
						<Field>
							<FieldLabel htmlFor="account-new-password">
								{t("account.password.new")}
							</FieldLabel>
							<Input
								id="account-new-password"
								type="password"
								autoComplete="new-password"
								minLength={8}
								maxLength={128}
								required
								value={password}
								disabled={!account || saving}
								onChange={(event) => setPassword(event.target.value)}
								placeholder={t("account.password.placeholder")}
							/>
							<FieldDescription>{t("account.password.hint")}</FieldDescription>
						</Field>
						<Button
							type="submit"
							disabled={!account || saving || password.trim().length < 8}
						>
							{saving
								? t("account.password.resetting")
								: t("account.password.reset")}
						</Button>
					</>
				)}
			</form>
			{message && (
				<output className="text-sm text-muted-foreground">{message}</output>
			)}
		</div>
	);
}
