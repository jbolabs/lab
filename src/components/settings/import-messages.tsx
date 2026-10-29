"use client";

import { Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	FieldLabel,
	Field,
	FieldGroup,
	FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup } from "@/lib/async-cleanup";

import type {
	ImportMessagesProps,
	ImportMessagesResult,
} from "./import-messages-types";
import { getImportSummary, importMessageFiles } from "./import-messages-utils";

export function ImportMessages({
	destination,
	sourceLabel,
}: ImportMessagesProps) {
	const { t } = useLanguage();
	const { selectedMailbox } = useSelectedMailbox();
	const [files, setFiles] = useState<File[]>([]);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<ImportMessagesResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox?.id || files.length === 0) {
			return;
		}
		setLoading(true);
		setError(null);
		setResult(null);
		return await withCleanup(
			async () => {
				try {
					const nextResult = await importMessageFiles(
						selectedMailbox.id,
						files,
						destination
					);
					setResult(nextResult);
					window.dispatchEvent(new Event("mailflare:messages-changed"));
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("import.failed")
					);
				}
			},
			() => {
				setLoading(false);
			}
		);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Upload className="size-4" />
					{t("import.title")}
				</CardTitle>
				<CardDescription>
					{t("import.description", { source: sourceLabel })}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="mail-import">
								{t("import.filesLabel")}
							</FieldLabel>
							<Input
								id="mail-import"
								type="file"
								accept=".eml,.mbox,.mbx,message/rfc822,application/mbox"
								multiple
								onChange={(event) => setFiles([...(event.target.files ?? [])])}
							/>
							<FieldDescription>{t("import.limits")}</FieldDescription>
						</Field>

						<Button
							type="submit"
							disabled={!selectedMailbox || files.length === 0 || loading}
						>
							{loading ? t("import.importing") : t("import.submit")}
						</Button>

						{result && (
							<Alert variant="success">
								<AlertTitle>{getImportSummary(result, t)}</AlertTitle>
								{(result.errors ?? []).length > 0 && (
									<AlertDescription>
										<ul className="flex list-disc flex-col gap-1 pl-5 text-xs">
											{(result.errors ?? []).slice(0, 5).map((item) => (
												<li key={item}>{item}</li>
											))}
										</ul>
									</AlertDescription>
								)}
							</Alert>
						)}

						{error && (
							<Alert variant="error">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
