"use client";

import { useEffect, useState } from "react";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import { FileText, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { authFetch } from "@/lib/auth/client";
import { textToHtml } from "./rich-text-utils";
import type { ComposeTemplate, TemplateMenuProps } from "./template-types";

export function TemplateMenu({ onApply, onNew }: TemplateMenuProps) {
	const { t } = useLanguage();
	const [templates, setTemplates] = useState<ComposeTemplate[]>([]);

	useEffect(() => {
		void authFetch("/api/templates", { cache: "no-store" })
			.then(async (response) => {
				if (response.ok)
					setTemplates(
						((await response.json()) as { templates: ComposeTemplate[] })
							.templates,
					);
			})
			.catch(() => {});
	}, []);
	async function remove(id: string) {
		const response = await authFetch(`/api/templates/${id}`, {
			method: "DELETE",
		});
		if (response.ok)
			setTemplates((current) =>
				current.filter((template) => template.id !== id),
			);
	}

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<span className="flex items-center">
					<FileText className="mr-2 h-4 w-4" />
					{t("template.menu")}
				</span>
			</DropdownMenuSubTrigger>

			<DropdownMenuSubContent sideOffset={4} className="min-w-64">
				<DropdownMenuGroup>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{templates.length === 0 && (
							<p className="px-3 py-2 text-xs text-muted-foreground">
								{t("template.none")}
							</p>
						)}
						{templates.map((template) => (
							<DropdownMenuItem
								key={template.id}
								onSelect={() =>
									onApply({
										title: template.subject ?? "",
										html:
											template.htmlBody ?? textToHtml(template.textBody ?? ""),
									})
								}
								className="group justify-between gap-2"
							>
								<span className="whitespace-normal break-words">
									{template.subject || t("template.untitled")}
								</span>
								<Button
									variant="ghost"
									size="icon"
									type="button"
									aria-label={t("template.delete")}
									onPointerDown={(event) => event.stopPropagation()}
									onClick={(event) => {
										event.stopPropagation();
										void remove(template.id);
									}}
									className="shrink-0"
								>
									<Trash2 data-icon="inline-start" />
								</Button>
							</DropdownMenuItem>
						))}
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onNew}>
						<Plus className="mr-2 h-4 w-4" />
						{t("template.new")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
