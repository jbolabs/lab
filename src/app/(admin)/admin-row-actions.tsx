"use client";

import { useState, type ReactNode } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AdminConfirmAction } from "./admin-confirm-action";

export function AdminRowActions({ title, description, confirmLabel, match, onConfirm, disabled, children }: {
	title: string; description: string; confirmLabel: string; match?: string;
	onConfirm: () => void | Promise<unknown>; disabled?: boolean; children?: ReactNode;
}) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(false);
	return <>
		<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("common.moreActions")}><MoreVertical /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{children}<DropdownMenuItem className="min-h-11" variant="destructive" disabled={disabled} onSelect={() => setOpen(true)}><Trash2 />{confirmLabel}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
		<AdminConfirmAction open={open} onOpenChange={setOpen} title={title} description={description} confirmLabel={confirmLabel} match={match} onConfirm={onConfirm} disabled={disabled} />
	</>;
}
