"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useMessageConfirmation } from "./use-message-confirmation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Archive, ChevronLeft, ChevronRight, ListFilter, Mail, MailOpen, Trash2, Star } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HintTooltip } from "@/components/hint-tooltip";
import { useMailSearch } from "@/components/mail-search/mail-search-context";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { usePageLoading } from "@/components/page-loading";
import { formatScheduledSendTime } from "./scheduled-send-utils";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { useMessageCounts } from "@/hooks/use-message-counts";
import { useMessages } from "@/hooks/use-messages";
import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import type { Message } from "@/hooks/types";
import { setMessageDragData } from "@/lib/messages/drag-utils";
import { BulkMessageToolbar } from "./bulk-message-toolbar";
import { SwipeableRow } from "./swipeable-row";
import { MessageListRowActions } from "./message-list-row-actions";
import { dispatchMessageCountsDelta, toggleMessageStar } from "./message-list-row-actions-utils";
import { MessageNavigationProgress, useMessageNavigation } from "./message-navigation";
import { rememberOpenedUnreadMessage } from "./message-detail-navigation-utils";
import { useConversationView } from "./use-conversation-view";
import type { MessageFolderPageProps, MessageListRowProps, RowMessageAction } from "./types";
import {
	formatMessageListTimestamp,
	getPageRange,
	getMessageParty,
	getMessagePartyClassName,
	getMessagePreview,
	getUnreadFlipCount,
	isMessageListRowUnread,
	formatEmailPageTitle,
	getMailboxAddress,
	runBulkMessageAction,
	emptyMessageFolder,
} from "./utils";
import {
	getEmptyFolderConfirmText,
	getEmptyFolderLabel,
	getPermanentDeleteFolderLabel,
	getPermanentDeleteConfirmText,
	PartialDeleteError,
	supportsPermanentDelete,
} from "@/lib/messages/permanent-delete-utils";
import { cn as clsx } from "@/lib/utils";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

const pageSize = 25;

function MessageListRow({
	message,
	config,
	selected,
	active = false,
	compact = false,
	currentAccountName,
	onSelectedChange,
	onMessageAction,
	dragMessageIds,
}: MessageListRowProps) {
	const { t } = useLanguage();
	const Icon = config.icon;
	const [read, setRead] = useState(message.read);
	const [threadUnread, setThreadUnread] = useState(message.threadUnread);
	const [starred, setStarred] = useState(message.starred);
	useEffect(() => setRead(message.read), [message.read]);
	useEffect(() => setThreadUnread(message.threadUnread), [message.threadUnread]);
	useEffect(() => setStarred(message.starred), [message.starred]);
	const rowMessage = { ...message, read, starred, threadUnread };
	const unread = isMessageListRowUnread(rowMessage);
	const draggable = config.folder === "inbox" && message.direction === "inbound";
	const party = getMessageParty(rowMessage, config.folder, currentAccountName, t);
	const preview = getMessagePreview(rowMessage, config.folder, t);
	const href = `${config.hrefPrefix}/${message.id}`;
	const navigation = useMessageNavigation(href, rowMessage);

	const affectsInboxCount = config.folder === "inbox" && !config.folderId;

	async function runRowAction(action: RowMessageAction) {
		const previousRead = read;
		const previousThreadUnread = threadUnread;
		const unreadDelta = !affectsInboxCount || (action !== "read" && action !== "unread")
			? 0
			: getUnreadFlipCount(rowMessage, action === "read") * (action === "read" ? -1 : 1);
		if (action === "read") setRead(true);
		if (action === "unread") setRead(false);
		// Grouped rows derive their unread styling from the thread count, so it must change with the row.
		if (message.threadMessageIds) {
			if (action === "read") setThreadUnread(0);
			if (action === "unread") setThreadUnread(message.threadMessageIds.length);
		}
		if (unreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta: unreadDelta });
		try {
			await onMessageAction(message.id, action);
		} catch (error) {
			if (action === "read" || action === "unread") {
				setRead(previousRead);
				setThreadUnread(previousThreadUnread);
				if (unreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta: -unreadDelta });
			}
			throw error;
		}
	}

	const swipeable = compact && (config.folder === "inbox" || config.folder === "snoozed") && message.direction === "inbound";

	function onMessageNavigate(event: MouseEvent<HTMLAnchorElement>) {
		if (!read && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
			rememberOpenedUnreadMessage(message.id);
			const previousThreadUnread = threadUnread;
			setRead(true);
			if (previousThreadUnread !== undefined) setThreadUnread(Math.max(0, previousThreadUnread - 1));
			if (affectsInboxCount && message.direction === "inbound") dispatchMessageCountsDelta({ inboxUnreadDelta: -1 });
			void runBulkMessageAction([message.id], "read", false).catch(() => {
				setRead(false);
				setThreadUnread(previousThreadUnread);
				if (affectsInboxCount && message.direction === "inbound") dispatchMessageCountsDelta({ inboxUnreadDelta: 1 });
			});
		}
		navigation.onNavigate(event, !read);
	}

	if (compact) {
		const compactRow = (
			<div
				role={swipeable ? undefined : "listitem"}
				className={`group grid grid-cols-[28px_minmax(0,1fr)_32px] gap-2 border-l-2 px-4 py-3 transition-colors ${active
					? "border-l-signal bg-signal-soft"
					: selected
						? "border-l-transparent bg-muted/60"
						: "border-l-transparent hover:bg-accent/60"
					} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
				draggable={draggable}
				onDragStart={(event) => {
					if (!draggable) return;
					setMessageDragData(event.dataTransfer, { messageIds: dragMessageIds });
				}}
			>
				<MessageNavigationProgress progress={navigation.progress} />
				<Checkbox
					checked={selected}
					onCheckedChange={(checked) => onSelectedChange(message.id, (checked === true))}
					className="mt-1 relative after:absolute after:-inset-3.5"
					aria-label={t("list.selectFrom", { sender: party })}
				/>
				<Link href={href} onClick={config.folder === "drafts" ? undefined : onMessageNavigate} aria-current={active ? "true" : undefined} className="min-w-0">
					<span className="flex items-baseline justify-between gap-3">
						<span className={clsx(unread && "font-semibold",getMessagePartyClassName(rowMessage, config.folder))}>
							{unread && <><span aria-hidden="true" className="mr-2 inline-block size-1.5 rounded-full bg-signal align-middle" /><span className="sr-only">{t("list.unread")} </span></>}
							{party}

							{(message.threadCount ?? 1) > 1 && (
								<span className="ml-2 text-xs font-normal text-muted-foreground">{message.threadCount}</span>
							)}
						</span>
						<span className={clsx(unread ?"font-medium":"text-muted-foreground","shrink-0 text-[11px]")}>
							{message.scheduledAt ? formatScheduledSendTime(message.scheduledAt, t) : formatMessageListTimestamp(message.createdAt)}
						</span>
					</span>
					<span
						className={`mt-1 block truncate text-sm ${unread ? "font-semibold text-foreground" : "text-foreground/80"
							}`}
					>
						{message.subject ?? t("list.noSubject")}
					</span>
					<span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
						{preview}
					</span>
				</Link>
				<Button variant="ghost" size="icon" className="self-center pointer-coarse:min-h-11 pointer-coarse:min-w-11" aria-label={starred ? t("message.removeStar") : t("message.star")} aria-pressed={starred} onClick={() => void toggleMessageStar(message.id).then(result => setStarred(result.starred)).catch(() => toast.error(t("message.error.star")))}><Star data-icon="inline-start" className={starred ? "fill-current" : undefined} /></Button>
			</div>
		);
		if (!swipeable) return compactRow;
		return (
			<SwipeableRow
				role="listitem"
				startAction={{
					label: read ? t("list.markUnread") : t("list.markRead"),
					icon: read ? Mail : MailOpen,
					className: "bg-primary",
					onTrigger: () => void runRowAction(read ? "unread" : "read").catch(() => undefined),
				}}
				endAction={{
					label: t("common.archive"),
					icon: Archive,
					className: "bg-emerald-600",
					onTrigger: () => void runRowAction("archive").catch(() => undefined),
				}}
			>
				{compactRow}
			</SwipeableRow>
		);
	}

	const className =
		`group relative grid min-h-16 w-full grid-cols-[24px_36px_minmax(160px,190px)_1fr_auto] items-center gap-3 px-6 text-left text-sm hover:bg-accent/60 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-ring ${active || selected ? "bg-signal-soft" : ""
		} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`;
	const content = (
		<>
			{message.direction === "inbound" && (
				<HintTooltip label={starred ? t("list.starred") : t("list.notStarred")}>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="relative z-10"
						onClick={() => {
							void toggleMessageStar(message.id).then((result) => setStarred(result.starred)).catch(() => toast.error(t("message.error.star")));
						}}
						aria-label={t("message.star")}
						aria-pressed={starred}
					>
						<Star data-icon="inline-start" className={starred ? "fill-current" : undefined} />
					</Button>
				</HintTooltip>
			)}
			{message.direction !== "inbound" && (
				<Icon className="h-4 w-4 text-muted-foreground/50" />
			)}
			<span className={clsx(unread && "font-semibold", getMessagePartyClassName(rowMessage, config.folder))}>
				{unread && <><span aria-hidden="true" className="mr-2 inline-block size-1.5 rounded-full bg-signal align-middle" /><span className="sr-only">{t("list.unread")} </span></>}
				{party}

				{(message.threadCount ?? 1) > 1 && (
					<span className="ml-2 text-xs text-muted-foreground">{message.threadCount}</span>
				)}
			</span>
			<span className="truncate text-foreground/80">
				<Link
					href={href}
					onClick={config.folder === "drafts" ? undefined : onMessageNavigate}
					aria-current={active ? "true" : undefined}
					className="focus-visible:outline-none after:absolute after:inset-0"
				>
					<span className={unread ? "font-semibold text-foreground" : ""}>
						{rowMessage.subject ?? t("list.noSubject")}
					</span>
					<span className="text-muted-foreground"> - {getMessagePreview(rowMessage, config.folder, t)}</span>
				</Link>
			</span>
			<time
				dateTime={message.createdAt}
				className={clsx("min-w-[96px] whitespace-nowrap text-right text-xs", (config.folder === "inbox" || config.folder === "snoozed") && message.direction === "inbound" && "[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-0", unread ? "font-semibold text-foreground" : "text-muted-foreground")}
			>
				{message.scheduledAt ? formatScheduledSendTime(message.scheduledAt, t) : formatMessageListTimestamp(message.createdAt)}
			</time>
		</>
	);

	if (config.folder === "drafts") {
		return (
			<div role="listitem" className={className}>
				<Checkbox
					checked={selected}
					onCheckedChange={(checked) => onSelectedChange(message.id, (checked === true))}
					className="relative z-10 after:absolute after:-inset-3.5"
					aria-label={t("list.selectMessage")}
				/>
				{content}
			</div>
		);
	}

	return (
		<div
			role="listitem"
			className={className}
			draggable={draggable}
			onDragStart={(event) => {
				if (!draggable) return;
				setMessageDragData(event.dataTransfer, { messageIds: dragMessageIds });
			}}
		>
			<MessageNavigationProgress progress={navigation.progress} />
			<Checkbox
				checked={selected}
				onCheckedChange={(checked) => onSelectedChange(message.id, (checked === true))}
				className="relative z-10 after:absolute after:-inset-3.5"
				aria-label={t("list.selectFrom", { sender: party })}
			/>
			{content}
			{(config.folder === "inbox" || config.folder === "snoozed") && message.direction === "inbound" && (
				<MessageListRowActions
					message={rowMessage}
					onAction={runRowAction}
				/>
			)}
		</div>
	);
}

export function MessageFolderPage({
	config,
	compact = false,
	selectedMessageId,
	selection,
}: MessageFolderPageProps) {
	const { t } = useLanguage();
	const { confirm, confirmation } = useMessageConfirmation();
	const title = config.titleKey ? t(config.titleKey) : config.title;
	const { selectedMailbox, isLoading: mailboxesLoading } = useSelectedMailbox();
	const { query } = useMailSearch();
	const isMobile = useIsMobile();
	const [offset, setOffset] = useState(0);
	const [internalSelectedMessages, setInternalSelectedMessages] = useState<
		Array<{ id: string; read: boolean }>
	>([]);
	const [pendingBulkAction, setPendingBulkAction] = useState(false);
	const [emptyingFolder, setEmptyingFolder] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [unreadOnly, setUnreadOnly] = useState(false);
	const [conversationView] = useConversationView();
	const grouped = conversationView && config.folder !== "drafts";
	const { messages, isLoading, total, limit, updateMessages } = useMessages(config.folder, selectedMailbox?.id, {
		query,
		limit: pageSize,
		offset,
		read: unreadOnly ? "unread" : "all",
		group: grouped ? "thread" : undefined,
	}, !mailboxesLoading, config.folderId);
	const { counts } = useMessageCounts(selectedMailbox?.id, !mailboxesLoading);
	usePageLoading(mailboxesLoading || isLoading);
	const headerIcons = config.headerIcons ?? [];
	const hasActiveFilters = !!query.trim();
	const folderCount = config.folderId
		? counts.customFolders[config.folderId]
		: counts.folders[config.folder];
	const titleTotal = folderCount?.total ?? total;
	const titleUnread = folderCount?.unread ?? 0;
	const mailboxAddress = getMailboxAddress(selectedMailbox);
	const currentAccountName = selectedMailbox?.displayName ?? selectedMailbox?.localPart;
	const pageRange = getPageRange(offset, messages.length, total);
	const selectedMessages = selection?.selectedMessages ?? internalSelectedMessages;
	const setSelectedMessages =
		selection?.setSelectedMessages ?? setInternalSelectedMessages;
	const selectedIds = useMemo(
		() => selectedMessages.map((message) => message.id),
		[selectedMessages],
	);
	const hasUnreadSelection = selectedMessages.some((message) => !message.read);
	const allVisibleSelected = messages.length > 0 && messages.every((message) => selectedIds.includes(message.id));
	// In conversation view a row stands for every message of its thread in this
	// folder, so actions and drags carry all of them.
	const rowMessageIds = (message: Message) => message.threadMessageIds ?? [message.id];
	const expandSelectedIds = (ids: string[]) =>
		ids.flatMap((id) => rowMessageIds(messages.find((message) => message.id === id) ?? { id } as Message));

	useEffect(() => {
		setOffset(0);
		setSelectedMessages([]);
	}, [query, selectedMailbox?.id, config.folder, config.folderId, unreadOnly, grouped]);

	useEffect(() => {
		setSelectedMessages([]);
	}, [offset]);

	useEffect(() => {
		const originalTitle = document.title;
		return () => {
			document.title = originalTitle;
		};
	}, []);

	useEffect(() => {
		if (mailboxesLoading) return;
		document.title = formatEmailPageTitle({
			location: title,
			inbox: config.folder === "inbox" && !config.folderId,
			total: titleTotal,
			unread: titleUnread,
			emailAddress: mailboxAddress,
		});
	}, [title, config.folder, config.folderId, mailboxAddress, mailboxesLoading, titleTotal, titleUnread]);

	useEffect(() => {
		if (isLoading) return;
		setSelectedMessages((current) => {
			const remaining = current.filter((item) => messages.some((message) => message.id === item.id));
			return remaining.length === current.length ? current : remaining;
		});
	}, [messages, isLoading]);

	useEffect(() => {
		if (isLoading || offset === 0 || messages.length > 0) return;
		setOffset(total > 0 ? Math.floor((total - 1) / limit) * limit : 0);
	}, [isLoading, offset, messages.length, total, limit]);

	function updateSelectedMessage(messageId: string, selected: boolean) {
		const message = messages.find((item) => item.id === messageId);
		if (!message) return;

		setSelectedMessages((current) => {
			if (!selected) return current.filter((item) => item.id !== messageId);
			if (current.some((item) => item.id === messageId)) return current;
			return [...current, { id: message.id, read: message.read && !(message.threadUnread ?? 0) }];
		});
	}

	function toggleAllVisible(selected: boolean) {
		const visibleIds = new Set(messages.map((message) => message.id));
		setSelectedMessages((current) => {
			if (!selected) {
				return current.filter((message) => !visibleIds.has(message.id));
			}

			const next = new Map(current.map((message) => [message.id, message]));
			for (const message of messages) {
				next.set(message.id, { id: message.id, read: message.read && !(message.threadUnread ?? 0) });
			}
			return Array.from(next.values());
		});
	}

	const permanentDeleteFolder = !config.folderId && supportsPermanentDelete(config.folder) ? config.folder : null;
	async function emptyFolder() {
		if (!permanentDeleteFolder || !selectedMailbox?.id) return;
		if (!(await confirm(getEmptyFolderConfirmText(permanentDeleteFolder, titleTotal, t)))) return;
		setEmptyingFolder(true);
		try {
			await emptyMessageFolder(selectedMailbox.id, permanentDeleteFolder);
			setOffset(0);
		} catch (error) {
			console.error(error);
			toast.error(t("list.emptyFailed", { folder: getPermanentDeleteFolderLabel(permanentDeleteFolder, t) }));
		} finally {
			setEmptyingFolder(false);
		}
	}

	useEffect(() => {
		if (!actionError) return;
		const timer = setTimeout(() => setActionError(null), 6000);
		return () => clearTimeout(timer);
	}, [actionError]);

	async function runSelectedActionReportingErrors(action: BulkMessageAction, folderId?: string) {
		setActionError(null);
		try {
			await runSelectedAction(action, folderId);
		} catch (error) {
			setActionError(error instanceof PartialDeleteError ? t("actions.error.deleteSkipped") : t("actions.error.update"));
		}
	}

	async function runSelectedAction(action: BulkMessageAction, folderId?: string) {
		if (selectedIds.length === 0) return;
		if (action === "delete") {
			const ids = expandSelectedIds(selectedIds);
			if (!(await confirm(getPermanentDeleteConfirmText(ids.length, t)))) return;
		}

		setPendingBulkAction(true);
		const previousMessages = messages;
		const readValue = action === "read" ? true : action === "unread" ? false : null;
		const inboxUnreadDelta = readValue === null || config.folder !== "inbox" || config.folderId
			? 0
			: messages
				.filter((message) => selectedIds.includes(message.id))
				.reduce((total, message) => total + getUnreadFlipCount(message, readValue), 0) * (readValue ? -1 : 1);
		if (readValue !== null) {
			updateMessages((current) => current.map((message) =>
				selectedIds.includes(message.id)
					? { ...message, read: readValue, ...(message.threadMessageIds ? { threadUnread: readValue ? 0 : message.threadMessageIds.length } : {}) }
					: message,
			));
			setSelectedMessages((current) => current.map((message) => ({ ...message, read: readValue })));
			if (inboxUnreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta });
		}
		try {
			await runBulkMessageAction(expandSelectedIds(selectedIds), action, true, folderId);
			setSelectedMessages([]);
		} catch (error) {
			if (readValue !== null) {
				updateMessages(previousMessages);
				if (inboxUnreadDelta) dispatchMessageCountsDelta({ inboxUnreadDelta: -inboxUnreadDelta });
			}
			throw error;
		} finally {
			setPendingBulkAction(false);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			{confirmation}
			<div className={`flex h-14 shrink-0 items-center justify-between border-b border-border ${compact ? "px-4" : "px-4.5 md:px-6"}`}>
				{selectedMessageId ? <h2 className="sr-only">{title}</h2> : <h1 className="sr-only">{title}</h1>}
				<div className="flex min-w-0 flex-1 items-center gap-4">
					<HintTooltip label={t("list.selectAll")}>
						<Checkbox
							checked={allVisibleSelected}
							disabled={messages.length === 0}
							onCheckedChange={(checked) => toggleAllVisible((checked === true))}
							className="relative after:absolute after:-inset-3.5"
							aria-label={t("list.selectAll")}
						/>
					</HintTooltip>
					{selectedIds.length > 0 && !compact ? (
						<BulkMessageToolbar
							selectedCount={selectedIds.length}
							hasUnreadSelection={hasUnreadSelection}
							onAction={runSelectedActionReportingErrors}
							onClearSelection={() => setSelectedMessages([])}
							pending={pendingBulkAction}
							folder={config.folderId ? undefined : config.folder}
						/>
					) : (
						(
							<p aria-hidden="true" className="truncate font-semibold text-foreground pl-1">{title}</p>
						)
					)}
				</div>
				{(selectedIds.length === 0 || compact) && (
					<div className="flex shrink-0 items-center gap-1 text-muted-foreground [&_button]:pointer-coarse:size-11">
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{t("list.range", { start: pageRange.start, end: pageRange.end, total: pageRange.total })}
						</span>
						<HintTooltip label={t("list.previousPage")}>
							<Button
								variant="ghost"
								size="icon"
								disabled={offset === 0 || isLoading}
								onClick={() => setOffset(Math.max(offset - limit, 0))}
								aria-label={t("list.previousPage")}
							>
								<ChevronLeft data-icon="inline-start" />
							</Button>
						</HintTooltip>
						<HintTooltip label={t("list.nextPage")}>
							<Button
								variant="ghost"
								size="icon"
								disabled={offset + messages.length >= total || isLoading}
								onClick={() => setOffset(offset + limit)}
								aria-label={t("list.nextPage")}
							>
								<ChevronRight data-icon="inline-start" />
							</Button>
						</HintTooltip>
						{config.folder === "inbox" && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("list.showUnreadOnly")}><ListFilter data-icon="inline-start" /></Button></DropdownMenuTrigger>
								<DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuCheckboxItem checked={unreadOnly} onCheckedChange={setUnreadOnly}>{t("list.showUnreadOnly")}</DropdownMenuCheckboxItem></DropdownMenuGroup></DropdownMenuContent>
							</DropdownMenu>
						)}
						{permanentDeleteFolder && (
							<HintTooltip label={getEmptyFolderLabel(permanentDeleteFolder, t)}>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									aria-label={getEmptyFolderLabel(permanentDeleteFolder, t)}
									disabled={emptyingFolder || isLoading || total === 0}
									onClick={() => void emptyFolder()}
									className="shrink-0"
								>
									<Trash2 data-icon="inline-start" />
									{!compact && <span className="max-md:hidden">{emptyingFolder ? t("list.emptying") : getEmptyFolderLabel(permanentDeleteFolder, t)}</span>}
								</Button>
							</HintTooltip>
						)}
						{!compact && headerIcons.map((Icon, index) => (
							<Icon key={index} className="h-4 w-4" />
						))}
					</div>
				)}
			</div>

			{actionError && (
				<Alert variant="destructive" className="shrink-0"><AlertDescription>{actionError}</AlertDescription></Alert>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-gutter-stable">
				<div role="list" aria-label={title} className="divide-y divide-border">
					{messages.map((message) => (
						<MessageListRow
							key={message.id}
							message={message}
							config={config}
							selected={selectedIds.includes(message.id)}
							active={message.id === selectedMessageId}
							compact={compact || isMobile}
							currentAccountName={currentAccountName}
							onSelectedChange={updateSelectedMessage}
							onMessageAction={(messageId, action) => {
								setActionError(null);
								return runBulkMessageAction(expandSelectedIds([messageId]), action, action !== "read" && action !== "unread").catch((error) => {
									setActionError(error instanceof PartialDeleteError ? t("actions.error.deleteSkipped") : t("actions.error.update"));
									throw error;
								});
							}}
							dragMessageIds={expandSelectedIds(selectedIds.includes(message.id) ? selectedIds : [message.id])}
						/>
					))}
				</div>
				{isLoading && messages.length === 0 && <SkeletonRows compact={compact || isMobile} />}
				{!isLoading && messages.length === 0 && (
					<Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><config.icon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{hasActiveFilters ? t("list.noMatch") : config.emptyTextKey ? t(config.emptyTextKey) : config.emptyText}</EmptyDescription></EmptyHeader></Empty>
				)}
			</div>
		</div>
	);
}
