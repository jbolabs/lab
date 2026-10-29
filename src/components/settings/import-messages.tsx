"use client";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import type { FormEvent } from "react";
import { useState } from "react";
import { Upload } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
		if (!selectedMailbox?.id || files.length === 0) return;
		setLoading(true);
		setError(null);
		setResult(null);
		try {
			const nextResult = await importMessageFiles(
				selectedMailbox.id,
				files,
				destination,
			);
			setResult(nextResult);
			window.dispatchEvent(new Event("mailflare:messages-changed"));
		} catch (err) {
			setError(err instanceof Error ? err.message : t("import.failed"));
		} finally {
			setLoading(false);
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Upload className="h-4 w-4" />
					{t("import.title")}
				</CardTitle>
				<CardDescription>
					{t("import.description", { source: sourceLabel })}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-4">
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
								onChange={(event) =>
									setFiles(Array.from(event.target.files ?? []))
								}
								className="block w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
							/>
							<p className="text-xs leading-5 text-muted-foreground">
								{t("import.limits")}
							</p>
						</Field>

						<Button
							type="submit"
							disabled={!selectedMailbox || files.length === 0 || loading}
						>
							{loading ? t("import.importing") : t("import.submit")}
						</Button>

						{result && (
							<div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
								<p className="font-medium">{getImportSummary(result, t)}</p>
								{(result.errors ?? []).length > 0 && (
									<ul className="mt-2 list-disc flex flex-col gap-1 pl-5 text-xs">
										{(result.errors ?? []).slice(0, 5).map((item) => (
											<li key={item}>{item}</li>
										))}
									</ul>
								)}
							</div>
						)}

						{error && (
							<p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-destructive">
								{error}
							</p>
						)}
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
