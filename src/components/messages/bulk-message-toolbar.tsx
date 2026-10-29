"use client";

import { Archive, ArchiveRestore, ChevronDown, Folder, FolderInput, Inbox, Mail, MailOpen, MoreVertical, ShieldAlert, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { DropdownMenu as Root, DropdownMenuTrigger as Trigger, DropdownMenuContent as Content, DropdownMenuItem as Item, DropdownMenuGroup as Group, DropdownMenuSeparator as Separator, DropdownMenuLabel as Label } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { MessageActionMenu } from "./message-action-menu";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { useMailboxFolders } from "./use-mailbox-folders";
import { HintTooltip } from "@/components/hint-tooltip";
import { supportsPermanentDelete } from "@/lib/messages/permanent-delete-utils";
import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import type { BulkMessageToolbarProps } from "./types";


export function BulkMessageToolbar({
	selectedCount,
	hasUnreadSelection,
	hideSelectedCount = false,
	onAction,
	onClearSelection,
	pending,
	folder,
}: BulkMessageToolbarProps) {
	const { t } = useLanguage();
	const [moreOpen, setMoreOpen] = useState(false);
	// In archived, spam and trash the usual button would be a no-op, so it becomes the way back to the inbox.
	const archive = folder === "archived"
		? { action: "inbox", label: t("common.unarchive"), Icon: ArchiveRestore }
		: { action: "archive", label: t("common.archive"), Icon: Archive };
	const spam = folder === "spam"
		? { action: "inbox", label: t("common.notSpam"), Icon: ShieldCheck }
		: { action: "spam", label: t("common.reportSpam"), Icon: ShieldAlert };
	const trash = folder === "trash"
		? { action: "inbox", label: t("common.restore"), Icon: Undo2 }
		: { action: "trash", label: t("common.delete"), Icon: Trash2 };
	// Trash and Spam also offer the irreversible delete; the page confirms before running it.
	const canDeleteForever = supportsPermanentDelete(folder);
	const moveOptions = [
		{ value: "inbox", label: t("navigation.inbox"), Icon: Inbox, hidden: folder === "inbox" },
		{ value: "archive", label: t("navigation.archived"), Icon: Archive, hidden: folder === "archived" },
		{ value: "spam", label: t("navigation.spam"), Icon: ShieldAlert, hidden: folder === "spam" },
		{ value: "trash", label: t("navigation.trash"), Icon: Trash2, hidden: folder === "trash" },
	].filter((option) => !option.hidden);
	const { selectedMailbox } = useSelectedMailbox();
	const folders = useMailboxFolders(selectedMailbox?.id);
	return (
		<div className="flex min-w-0 items-center gap-1 text-muted-foreground w-full [&_button]:pointer-coarse:min-h-11 [&_button]:pointer-coarse:min-w-11">
			{!hideSelectedCount && (
				<span className="mr-2 text-sm font-medium text-foreground">
					{t("common.selectedCount", { count: selectedCount })}
				</span>
			)}
			<span className="flex-1 md:hidden" />
			<HintTooltip label={archive.label}>
				<Button variant="ghost" size="icon" onClick={() => onAction(archive.action as BulkMessageAction)} disabled={pending} aria-label={archive.label}>
					<archive.Icon data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={spam.label} className="max-md:hidden">
				<Button variant="ghost" size="icon" onClick={() => onAction(spam.action as BulkMessageAction)} disabled={pending} aria-label={spam.label}>
					<spam.Icon data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={trash.label}>
				<Button variant="ghost" size="icon" onClick={() => onAction(trash.action as BulkMessageAction)} disabled={pending} aria-label={trash.label}>
					<trash.Icon data-icon="inline-start" />
				</Button>
			</HintTooltip>
			{canDeleteForever && (
				<HintTooltip label={t("common.deleteForever")}>
					<Button variant="ghost" size="icon" className="text-destructive" onClick={() => onAction("delete")} disabled={pending} aria-label={t("common.deleteForever")}>
						<Trash2 data-icon="inline-start" />
					</Button>
				</HintTooltip>
			)}
			<HintTooltip label={hasUnreadSelection ? t("common.markRead") : t("common.markUnread")}>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onAction(hasUnreadSelection ? "read" : "unread")}
					disabled={pending}
					aria-label={hasUnreadSelection ? t("common.markRead") : t("common.markUnread")}
				>
					{hasUnreadSelection ? <MailOpen data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
				</Button>
			</HintTooltip>
			<span className="flex-1 max-md:hidden" />
			<Root>
				<HintTooltip label={t("common.moveSelected")} className="max-md:hidden">
					<Trigger asChild>
						<Button variant="ghost" size="sm" className="max-md:hidden" disabled={pending}>
							<FolderInput data-icon="inline-start" />
							{t("common.moveTo")}
							<ChevronDown data-icon="inline-start" />
						</Button>
					</Trigger>
				</HintTooltip>

					<Content align="end" sideOffset={4}><Group>
						{moveOptions.map(({ value, label, Icon }) => (
							<Item key={value} onSelect={() => onAction(value as BulkMessageAction)}><Icon data-icon="inline-start" />{label}</Item>
						))}
						{folders.length > 0 && (
							<>
								<Separator />
								<Label>{t("navigation.folders")}</Label>
								{folders.map((item) => (
									<Item key={item.id} onSelect={() => onAction("folder", item.id)}>
										<Folder className="h-4 w-4 shrink-0" style={{ color: item.color }} />
										<span className="truncate">{item.name}</span>
									</Item>
								))}
							</>
						)}
					</Group></Content>

			</Root>
			{/* Phones lead with it, like the close button of a native selection bar. */}
			<HintTooltip label={t("common.clearSelection")} className="max-md:order-first">
				<Button variant="ghost" size="icon" className="max-md:-ml-2" onClick={onClearSelection} disabled={pending} aria-label={t("common.clearSelection")}>
					<X data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<div className="md:hidden"><MessageActionMenu open={moreOpen} onOpenChange={setMoreOpen} disabled={pending} actions={[
				{ label: spam.label, icon: <spam.Icon data-icon="inline-start" />, onSelect: () => void onAction(spam.action as BulkMessageAction) },
				...moveOptions.map(option => ({ label: `${t("common.moveTo")} ${option.label}`, icon: <option.Icon data-icon="inline-start" />, onSelect: () => void onAction(option.value as BulkMessageAction) })),
				...folders.map(folder => ({ label: `${t("common.moveTo")} ${folder.name}`, icon: <Folder data-icon="inline-start" />, onSelect: () => void onAction("folder", folder.id) })),
				...(canDeleteForever ? [{ label: t("common.deleteForever"), icon: <Trash2 data-icon="inline-start" />, onSelect: () => void onAction("delete") }] : []),
			]} /></div>
		</div>
	);
}
