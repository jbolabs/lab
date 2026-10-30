"use client";

import {
	Archive,
	ArchiveRestore,
	ChevronDown,
	Folder,
	FolderInput,
	Inbox,
	Mail,
	MailOpen,
	ShieldAlert,
	ShieldCheck,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties } from "react";

import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu as Root,
	DropdownMenuTrigger as Trigger,
	DropdownMenuContent as Content,
	DropdownMenuItem as Item,
	DropdownMenuGroup as Group,
	DropdownMenuSeparator as Separator,
	DropdownMenuLabel as Label,
} from "@/components/ui/dropdown-menu";
import { supportsPermanentDelete } from "@/lib/messages/permanent-delete-utils";

import { MessageActionMenu } from "./message-action-menu";
import type { BulkMessageToolbarProps } from "./types";
import { useMailboxFolders } from "./use-mailbox-folders";

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
	const archive =
		folder === "archived"
			? { Icon: ArchiveRestore, action: "inbox", label: t("common.unarchive") }
			: { Icon: Archive, action: "archive", label: t("common.archive") };
	const spam =
		folder === "spam"
			? { Icon: ShieldCheck, action: "inbox", label: t("common.notSpam") }
			: { Icon: ShieldAlert, action: "spam", label: t("common.reportSpam") };
	const trash =
		folder === "trash"
			? { Icon: Undo2, action: "inbox", label: t("common.restore") }
			: { Icon: Trash2, action: "trash", label: t("common.delete") };
	// Trash and Spam also offer the irreversible delete; the page confirms before running it.
	const canDeleteForever = supportsPermanentDelete(folder);
	const moveOptions = [
		{
			Icon: Inbox,
			hidden: folder === "inbox",
			label: t("navigation.inbox"),
			value: "inbox",
		},
		{
			Icon: Archive,
			hidden: folder === "archived",
			label: t("navigation.archived"),
			value: "archive",
		},
		{
			Icon: ShieldAlert,
			hidden: folder === "spam",
			label: t("navigation.spam"),
			value: "spam",
		},
		{
			Icon: Trash2,
			hidden: folder === "trash",
			label: t("navigation.trash"),
			value: "trash",
		},
	].filter((option) => !option.hidden);
	const { selectedMailbox } = useSelectedMailbox();
	const folders = useMailboxFolders(selectedMailbox?.id);
	return (
		<div className="flex w-full min-w-0 items-center gap-1 text-muted-foreground">
			{!hideSelectedCount && (
				<span className="mr-2 text-sm font-medium text-foreground">
					{t("common.selectedCount", { count: selectedCount })}
				</span>
			)}
			<span className="flex-1 md:hidden" />
			<HintTooltip label={archive.label}>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onAction(archive.action as BulkMessageAction)}
					disabled={pending}
					aria-label={archive.label}
				>
					<archive.Icon data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={spam.label} className="max-md:hidden">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onAction(spam.action as BulkMessageAction)}
					disabled={pending}
					aria-label={spam.label}
				>
					<spam.Icon data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={trash.label}>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onAction(trash.action as BulkMessageAction)}
					disabled={pending}
					aria-label={trash.label}
				>
					<trash.Icon data-icon="inline-start" />
				</Button>
			</HintTooltip>
			{canDeleteForever && (
				<HintTooltip label={t("common.deleteForever")}>
					<Button
						variant="ghost"
						size="icon"
						className="text-destructive"
						onClick={() => onAction("delete")}
						disabled={pending}
						aria-label={t("common.deleteForever")}
					>
						<Trash2 data-icon="inline-start" />
					</Button>
				</HintTooltip>
			)}
			<HintTooltip
				label={
					hasUnreadSelection ? t("common.markRead") : t("common.markUnread")
				}
			>
				<Button
					variant="ghost"
					size="icon"
					onClick={() => onAction(hasUnreadSelection ? "read" : "unread")}
					disabled={pending}
					aria-label={
						hasUnreadSelection ? t("common.markRead") : t("common.markUnread")
					}
				>
					{hasUnreadSelection ? (
						<MailOpen data-icon="inline-start" />
					) : (
						<Mail data-icon="inline-start" />
					)}
				</Button>
			</HintTooltip>
			<span className="flex-1 max-md:hidden" />
			<Root>
				<HintTooltip label={t("common.moveSelected")} className="max-md:hidden">
					<Trigger
						render={
							<Button
								variant="ghost"
								size="sm"
								className="max-md:hidden"
								disabled={pending}
							/>
						}
					>
						<FolderInput data-icon="inline-start" />
						{t("common.moveTo")}
						<ChevronDown data-icon="inline-start" />
					</Trigger>
				</HintTooltip>

				<Content align="end" sideOffset={4}>
					<Group>
						{moveOptions.map(({ value, label, Icon }) => (
							<Item
								key={value}
								onClick={() => onAction(value as BulkMessageAction)}
							>
								<Icon data-icon="inline-start" />
								{label}
							</Item>
						))}
						{folders.length > 0 && (
							<>
								<Separator />
								<Label>{t("navigation.folders")}</Label>
								{folders.map((item) => (
									<Item
										key={item.id}
										onClick={() => onAction("folder", item.id)}
									>
										<Folder
											className="size-4 shrink-0 text-(--mf-color)"
											style={{ "--mf-color": item.color } as CSSProperties}
										/>
										<span className="truncate">{item.name}</span>
									</Item>
								))}
							</>
						)}
					</Group>
				</Content>
			</Root>
			{/* Phones lead with it, like the close button of a native selection bar. */}
			<HintTooltip
				label={t("common.clearSelection")}
				className="max-md:order-first"
			>
				<Button
					variant="ghost"
					size="icon"
					className="max-md:-ml-2"
					onClick={onClearSelection}
					disabled={pending}
					aria-label={t("common.clearSelection")}
				>
					<X data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<div className="md:hidden">
				<MessageActionMenu
					open={moreOpen}
					onOpenChange={setMoreOpen}
					disabled={pending}
					actions={[
						{
							icon: <spam.Icon data-icon="inline-start" />,
							label: spam.label,
							onSelect: () => onAction(spam.action as BulkMessageAction),
						},
						...moveOptions.map((option) => ({
							icon: <option.Icon data-icon="inline-start" />,
							label: `${t("common.moveTo")} ${option.label}`,
							onSelect: () => onAction(option.value as BulkMessageAction),
						})),
						...folders.map((destinationFolder) => ({
							icon: <Folder data-icon="inline-start" />,
							label: `${t("common.moveTo")} ${destinationFolder.name}`,
							onSelect: () => onAction("folder", destinationFolder.id),
						})),
						...(canDeleteForever
							? [
									{
										icon: <Trash2 data-icon="inline-start" />,
										label: t("common.deleteForever"),
										onSelect: () => onAction("delete"),
									},
								]
							: []),
					]}
				/>
			</div>
		</div>
	);
}
