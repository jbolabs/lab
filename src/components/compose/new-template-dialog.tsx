"use client";

import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

import { textToHtml } from "./rich-text-utils";
import type { NewTemplateDialogProps } from "./template-types";

export function NewTemplateDialog({
	open,
	onOpenChange,
	mailboxId,
	from,
}: NewTemplateDialogProps) {
	const { t } = useLanguage();
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	async function save() {
		setSaving(true);
		setError("");
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch("/api/templates", {
						body: JSON.stringify({
							from,
							html: textToHtml(content),
							mailboxId,
							text: content,
							title,
						}),
						headers: { "Content-Type": "application/json" },
						method: "POST",
					});
					if (!response.ok) {
						setError(
							(
								(await response.json().catch(() => null)) as {
									error?: string;
								} | null
							)?.error ?? t("template.saveFailed")
						);
						return;
					}
					onOpenChange(false);
					setTitle("");
					setContent("");
				} catch {
					setError(t("template.saveFailed"));
				}
			},
			() => {
				setSaving(false);
			}
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{t("template.new")}</DialogTitle>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="template-title">
								{t("template.title")}
							</FieldLabel>
							<Input
								id="template-title"
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								maxLength={200}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="template-content">
								{t("template.content")}
							</FieldLabel>
							<Textarea
								id="template-content"
								value={content}
								onChange={(event) => setContent(event.target.value)}
								rows={8}
								required
							/>
						</Field>
						{error && <FieldError>{error}</FieldError>}
						<Button
							type="submit"
							disabled={saving || !title.trim() || !content.trim()}
						>
							{saving ? t("template.saving") : t("template.save")}
						</Button>
					</FieldGroup>
				</form>
			</DialogContent>
		</Dialog>
	);
}
