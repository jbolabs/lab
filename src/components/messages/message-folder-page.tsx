"use client";

import {
	Archive,
	Check,
	ChevronLeft,
	ChevronRight,
	ListFilter,
	Mail,
	MailOpen,
	Trash2,
	Star,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";

import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { useMailSearch } from "@/components/mail-search/mail-search-context";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { usePageLoading } from "@/components/page-loading";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { Message } from "@/hooks/types";
import { useMessageCounts } from "@/hooks/use-message-counts";
import { useMessageField } from "@/hooks/use-message-field";
import { useMessages } from "@/hooks/use-messages";
import { useOlderMessages } from "@/hooks/use-older-messages";
import { withCleanup } from "@/lib/async-cleanup";
import { splitEmailAddressList } from "@/lib/email/address";
import { haptic } from "@/lib/haptics";
import { setMessageDragData } from "@/lib/messages/drag-utils";
import {
	getEmptyFolderConfirmText,
	getEmptyFolderLabel,
	getPermanentDeleteFolderLabel,
	getPermanentDeleteConfirmText,
	PartialDeleteError,
	supportsPermanentDelete,
} from "@/lib/messages/permanent-delete-utils";
import { cn as clsx } from "@/lib/utils";

import { BulkMessageToolbar } from "./bulk-message-toolbar";
import { MessageAvatar } from "./message-avatar";
import { rememberOpenedUnreadMessage } from "./message-detail-navigation-utils";
import { MessageListRowActions } from "./message-list-row-actions";
import {
	dispatchMessageCountsDelta,
	toggleMessageStar,
} from "./message-list-row-actions-utils";
import {
	MessageNavigationProgress,
	useMessageNavigation,
} from "./message-navigation";
import { PullToRefresh } from "./pull-to-refresh";
import { reloadPage } from "./pull-to-refresh-utils";
import { formatScheduledSendTime } from "./scheduled-send-utils";
import { SwipeableRow } from "./swipeable-row";
import type {
	MessageFolderPageProps,
	MessageListRowProps,
	RowMessageAction,
} from "./types";
import { useConversationView } from "./use-conversation-view";
import { useLongPress } from "./use-long-press";
import { useMessageConfirmation } from "./use-message-confirmation";
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

const pageSize = 25;

function useMessageListRow({
	message,
	config,
	selected,
	active = false,
	compact = false,
	currentAccountName,
	onSelectedChange,
	onMessageAction,
	dragMessageIds,
	selectionMode = false,
}: MessageListRowProps) {
	const { t } = useLanguage();
	const Icon = config.icon;
	const [read, setRead] = useMessageField(message.read);
	const [threadUnread, setThreadUnread] = useMessageField(message.threadUnread);
	const [starred, setStarred] = useMessageField(message.starred);
	const rowMessage = { ...message, read, starred, threadUnread };
	const unread = isMessageListRowUnread(rowMessage);
	const draggable =
		config.folder === "inbox" && message.direction === "inbound";
	const party = getMessageParty(
		rowMessage,
		config.folder,
		currentAccountName,
		t
	);
	const preview = getMessagePreview(rowMessage, config.folder, t);
	const href = `${config.hrefPrefix}/${message.id}`;
	const navigation = useMessageNavigation(href, rowMessage);

	const affectsInboxCount = config.folder === "inbox" && !config.folderId;

	async function runRowAction(action: RowMessageAction) {
		const previousRead = read;
		const previousThreadUnread = threadUnread;
		const unreadDelta =
			!affectsInboxCount || (action !== "read" && action !== "unread")
				? 0
				: getUnreadFlipCount(rowMessage, action === "read") *
					(action === "read" ? -1 : 1);
		if (action === "read") {
			setRead(true);
		}
		if (action === "unread") {
			setRead(false);
		}
		// Grouped rows derive their unread styling from the thread count, so it must change with the row.
		if (message.threadMessageIds) {
			if (action === "read") {
				setThreadUnread(0);
			}
			if (action === "unread") {
				setThreadUnread(message.threadMessageIds.length);
			}
		}
		if (unreadDelta) {
			dispatchMessageCountsDelta({ inboxUnreadDelta: unreadDelta });
		}
		try {
			await onMessageAction(message.id, action);
		} catch (error) {
			if (action === "read" || action === "unread") {
				setRead(previousRead);
				setThreadUnread(previousThreadUnread);
				if (unreadDelta) {
					dispatchMessageCountsDelta({ inboxUnreadDelta: -unreadDelta });
				}
			}
			throw error;
		}
	}

	const swipeable =
		compact &&
		(config.folder === "inbox" || config.folder === "snoozed") &&
		message.direction === "inbound";
	const avatarAddress =
		message.direction === "inbound"
			? message.fromAddr
			: (splitEmailAddressList(message.toAddr)[0] ?? "");
	const longPress = useLongPress(
		() => onSelectedChange(message.id, !selected),
		compact && config.folder !== "drafts"
	);

	function toggleStar() {
		haptic("selection");
		void toggleMessageStar(message.id)
			.then((result) => setStarred(result.starred))
			.catch(() => toast.error(t("message.error.star")));
	}

	// Gmail's snackbar: the row is already gone, so offer to put it back. Undo returns it to the
	// inbox, which would also clear a snooze, so it is only offered from the inbox itself.
	async function archiveFromSwipe(restore: () => void) {
		try {
			await runRowAction("archive");
			if (config.folder !== "inbox" || config.folderId) {
				return;
			}
			toast(t("list.archived"), {
				action: {
					label: t("common.undo"),
					onClick: () => {
						restore();
						void onMessageAction(message.id, "inbox").catch(() => {
							// The row action reports its own error; preserve the current view.
						});
					},
				},
				duration: 6000,
			});
		} catch {
			restore();
		}
	}

	function onMessageNavigate(event: MouseEvent<HTMLAnchorElement>) {
		if (selectionMode) {
			event.preventDefault();
			haptic("selection");
			onSelectedChange(message.id, !selected);
			return;
		}
		if (
			!read &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey &&
			!event.altKey
		) {
			rememberOpenedUnreadMessage(message.id);
			const previousThreadUnread = threadUnread;
			setRead(true);
			if (previousThreadUnread !== undefined) {
				setThreadUnread(Math.max(0, previousThreadUnread - 1));
			}
			if (affectsInboxCount && message.direction === "inbound") {
				dispatchMessageCountsDelta({ inboxUnreadDelta: -1 });
			}
			void runBulkMessageAction([message.id], "read", false).catch(() => {
				setRead(false);
				setThreadUnread(previousThreadUnread);
				if (affectsInboxCount && message.direction === "inbound") {
					dispatchMessageCountsDelta({ inboxUnreadDelta: 1 });
				}
			});
		}
		navigation.onNavigate(event, !read);
	}

	return {
		Icon,
		active,
		archiveFromSwipe,
		avatarAddress,
		config,
		currentAccountName,
		dragMessageIds,
		draggable,
		href,
		longPress,
		message,
		navigation,
		onMessageAction,
		onMessageNavigate,
		onSelectedChange,
		party,
		preview,
		read,
		rowMessage,
		runRowAction,
		selected,
		selectionMode,
		starred,
		swipeable,
		t,
		toggleStar,
		unread,
	};
}

function MessageRowAvatar({
	row,
	className,
}: {
	row: ReturnType<typeof useMessageListRow>;
	className: string;
}) {
	const { message, avatarAddress, party } = row;
	return (
		<MessageAvatar
			mailboxId={message.mailboxId}
			address={avatarAddress}
			name={party}
			hasManagedAvatar={
				message.direction === "inbound" && !!message.fromContactHasAvatar
			}
			className={className}
		/>
	);
}

function CompactMessageListRow({
	row,
}: {
	row: ReturnType<typeof useMessageListRow>;
}) {
	const {
		message,
		config,
		selected,
		active,
		onSelectedChange,
		dragMessageIds,
		selectionMode,
		t,
		read,
		starred,
		rowMessage,
		unread,
		draggable,
		party,
		preview,
		href,
		navigation,
		swipeable,
		longPress,
		toggleStar,
		archiveFromSwipe,
		onMessageNavigate,
		runRowAction,
	} = row;

	const getSelectionClass = () => {
		if (active) {
			return "border-l-signal bg-signal-soft";
		}
		return selected
			? "border-l-transparent bg-muted/60"
			: "border-l-transparent hover:bg-accent/60";
	};
	const compactRow = (
		<div
			className={`group relative grid grid-cols-[40px_minmax(0,1fr)_auto] gap-x-3 border-l-2 py-3 pr-2 pl-4 transition-colors select-none [-webkit-touch-callout:none] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-inset pointer-coarse:active:bg-accent/60 pointer-coarse:active:delay-75 ${getSelectionClass()} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
			{...longPress}
			draggable={draggable}
			onDragStart={(event) => {
				if (!draggable) {
					return;
				}
				setMessageDragData(event.dataTransfer, {
					messageIds: dragMessageIds,
				});
			}}
		>
			<MessageNavigationProgress progress={navigation.progress} />
			{/* Gmail's pattern: the sender's avatar is the selection control, and turns into a check when selected. */}
			<Button
				type="button"
				variant="ghost"
				size="icon-lg"
				aria-pressed={selected}
				aria-label={t("list.selectFrom", { sender: party })}
				onClick={() => {
					haptic("selection");
					onSelectedChange(message.id, !selected);
				}}
				className="relative z-10 mt-0.5 pointer-coarse:-mx-0.5 pointer-coarse:mt-0"
			>
				{selected ? (
					<span className="flex size-10 animate-in items-center justify-center rounded-full bg-signal text-signal-foreground duration-150 fade-in-0 zoom-in-75 motion-reduce:animate-none">
						<Check strokeWidth={2.5} />
					</span>
				) : (
					<MessageRowAvatar row={row} className="size-10" />
				)}
			</Button>
			{/* The link's ::after covers the row, so anywhere outside the avatar and star opens the message. */}
			<Link
				href={href}
				onClick={
					config.folder === "drafts" && !selectionMode
						? undefined
						: onMessageNavigate
				}
				aria-current={active ? "true" : undefined}
				className="min-w-0 outline-none after:absolute after:inset-0"
			>
				<span
					className={clsx(
						"block text-base leading-5",
						unread && "font-semibold",
						getMessagePartyClassName(rowMessage, config.folder)
					)}
				>
					{unread && (
						<>
							<span
								aria-hidden="true"
								className="mr-1.5 inline-block size-2 rounded-full bg-signal align-[0.1em]"
							/>
							<span className="sr-only">{t("list.unread")} </span>
						</>
					)}
					{party}
					{(message.threadCount ?? 1) > 1 && (
						<span className="ml-1.5 text-xs font-normal tabular-nums">
							{message.threadCount}
						</span>
					)}
				</span>
				<span
					className={clsx(
						"mt-0.5 block truncate text-sm leading-5",
						unread ? "font-semibold" : "text-foreground/85"
					)}
				>
					{message.subject ?? t("list.noSubject")}
				</span>
				<span className="mt-0.5 block truncate text-sm leading-5">
					{preview}
				</span>
			</Link>
			<div className="flex flex-col items-end justify-between">
				<span
					className={clsx(
						"mt-0.5 shrink-0 text-xs leading-5 whitespace-nowrap tabular-nums",
						unread ? "font-semibold" : ""
					)}
				>
					{message.scheduledAt
						? formatScheduledSendTime(message.scheduledAt, t)
						: formatMessageListTimestamp(message.createdAt)}
				</span>
				<Button
					variant="ghost"
					size="icon"
					className={clsx(
						"relative z-10 -mb-1.5 pointer-coarse:-mr-1 pointer-coarse:-mb-2.5",
						""
					)}
					aria-label={starred ? t("message.removeStar") : t("message.star")}
					aria-pressed={starred}
					onClick={toggleStar}
				>
					<Star
						data-icon="inline-start"
						className={clsx(
							"transition-transform duration-150 ease-out active:scale-90",
							starred && "fill-current"
						)}
					/>
				</Button>
			</div>
		</div>
	);
	if (!swipeable) {
		return <li>{compactRow}</li>;
	}
	return (
		<li>
			<SwipeableRow
				disabled={selectionMode}
				startAction={{
					className: "bg-primary text-primary-foreground",
					icon: read ? Mail : MailOpen,
					label: read ? t("list.markUnread") : t("list.markRead"),
					onTrigger: () =>
						runRowAction(read ? "unread" : "read").catch(() => {
							// The row action reports its own error; preserve the current view.
						}),
				}}
				endAction={{
					className: "bg-success text-background",
					dismisses: true,
					icon: Archive,
					label: t("common.archive"),
					onTrigger: archiveFromSwipe,
				}}
			>
				{compactRow}
			</SwipeableRow>
		</li>
	);
}

function DesktopMessageContent({
	row,
}: {
	row: ReturnType<typeof useMessageListRow>;
}) {
	const {
		message,
		config,
		active,
		t,
		Icon,
		starred,
		rowMessage,
		unread,
		party,
		href,
		toggleStar,
		onMessageNavigate,
	} = row;
	return (
		<>
			{message.direction === "inbound" && (
				<HintTooltip label={starred ? t("list.starred") : t("list.notStarred")}>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="relative z-10"
						onClick={toggleStar}
						aria-label={t("message.star")}
						aria-pressed={starred}
					>
						<Star
							data-icon="inline-start"
							className={starred ? "fill-current" : undefined}
						/>
					</Button>
				</HintTooltip>
			)}
			{message.direction !== "inbound" && (
				<Icon className="size-4 text-foreground/50" />
			)}
			<MessageRowAvatar row={row} className="size-8" />
			<span
				className={clsx(
					unread && "font-semibold",
					getMessagePartyClassName(rowMessage, config.folder)
				)}
			>
				{unread && (
					<>
						<span
							aria-hidden="true"
							className="mr-2 inline-block size-1.5 rounded-full bg-signal align-middle"
						/>
						<span className="sr-only">{t("list.unread")} </span>
					</>
				)}
				{party}

				{(message.threadCount ?? 1) > 1 && (
					<span className="ml-2 text-xs">{message.threadCount}</span>
				)}
			</span>
			<span className="truncate text-foreground/80">
				<Link
					href={href}
					onClick={config.folder === "drafts" ? undefined : onMessageNavigate}
					aria-current={active ? "true" : undefined}
					className="after:absolute after:inset-0 focus-visible:outline-none"
				>
					<span className={unread ? "font-semibold" : ""}>
						{rowMessage.subject ?? t("list.noSubject")}
					</span>
					<span> - {getMessagePreview(rowMessage, config.folder, t)}</span>
				</Link>
			</span>
			<time
				dateTime={message.createdAt}
				className={clsx(
					"min-w-[96px] text-right text-xs whitespace-nowrap",
					(config.folder === "inbox" || config.folder === "snoozed") &&
						message.direction === "inbound" &&
						"[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-0",
					unread ? "font-semibold" : ""
				)}
			>
				{message.scheduledAt
					? formatScheduledSendTime(message.scheduledAt, t)
					: formatMessageListTimestamp(message.createdAt)}
			</time>
		</>
	);
}
function DesktopMessageListRow({
	row,
}: {
	row: ReturnType<typeof useMessageListRow>;
}) {
	const {
		message,
		config,
		selected,
		active,
		onSelectedChange,
		dragMessageIds,
		t,
		rowMessage,
		draggable,
		party,
		navigation,
		runRowAction,
	} = row;
	const className = `group relative grid min-h-16 w-full grid-cols-[24px_36px_32px_minmax(160px,190px)_1fr_auto] items-center gap-3 px-6 text-left text-sm hover:bg-accent/60 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-ring ${
		active || selected ? "bg-signal-soft" : ""
	} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`;

	if (config.folder === "drafts") {
		return (
			<li className={className}>
				<Checkbox
					checked={selected}
					onCheckedChange={(checked) =>
						onSelectedChange(message.id, checked === true)
					}
					className="relative z-10 after:absolute after:-inset-3.5"
					aria-label={t("list.selectMessage")}
				/>
				<DesktopMessageContent row={row} />
			</li>
		);
	}

	return (
		<li>
			<div
				className={className}
				draggable={draggable}
				onDragStart={(event) => {
					if (!draggable) {
						return;
					}
					setMessageDragData(event.dataTransfer, {
						messageIds: dragMessageIds,
					});
				}}
			>
				<MessageNavigationProgress progress={navigation.progress} />
				<Checkbox
					checked={selected}
					onCheckedChange={(checked) =>
						onSelectedChange(message.id, checked === true)
					}
					className="relative z-10 after:absolute after:-inset-3.5"
					aria-label={t("list.selectFrom", { sender: party })}
				/>
				<DesktopMessageContent row={row} />
				{(config.folder === "inbox" || config.folder === "snoozed") &&
					message.direction === "inbound" && (
						<MessageListRowActions
							message={rowMessage}
							onAction={runRowAction}
						/>
					)}
			</div>
		</li>
	);
}

function MessageListRow(props: MessageListRowProps) {
	const row = useMessageListRow(props);
	return props.compact ? (
		<CompactMessageListRow row={row} />
	) : (
		<DesktopMessageListRow row={row} />
	);
}

function useFolderSelection(
	messages: Message[],
	isLoading: boolean,
	selection: MessageFolderPageProps["selection"],
	scope: string
) {
	const [internalSelectedMessages, setInternalSelectedMessages] = useState<
		{ id: string; read: boolean }[]
	>([]);
	const [previousScope, setPreviousScope] = useState(scope);
	if (scope !== previousScope) {
		setPreviousScope(scope);
		setInternalSelectedMessages([]);
	}
	const storedSelection =
		selection?.selectedMessages ?? internalSelectedMessages;
	const selectedMessages = useMemo(() => {
		if (scope !== previousScope) {
			return [];
		}
		if (isLoading) {
			return storedSelection;
		}
		const remaining = storedSelection.filter((item) =>
			messages.some((message) => message.id === item.id)
		);
		return remaining.length === storedSelection.length
			? storedSelection
			: remaining;
	}, [scope, previousScope, isLoading, storedSelection, messages]);
	if (
		!selection &&
		selectedMessages.length !== internalSelectedMessages.length
	) {
		setInternalSelectedMessages(selectedMessages);
	}
	const externalSetSelection = selection?.setSelectedMessages;
	const selectionScope = scope;
	const previousSelectionScope = useRef("");
	useEffect(() => {
		if (previousSelectionScope.current !== selectionScope) {
			previousSelectionScope.current = selectionScope;
			externalSetSelection?.([]);
		}
	}, [selectionScope, externalSetSelection]);
	useEffect(() => {
		if (isLoading || !externalSetSelection) {
			return;
		}
		externalSetSelection((current) => {
			const remaining = current.filter((item) =>
				messages.some((message) => message.id === item.id)
			);
			return remaining.length === current.length ? current : remaining;
		});
	}, [isLoading, messages, externalSetSelection]);
	const setSelectedMessages =
		selection?.setSelectedMessages ?? setInternalSelectedMessages;
	const selectedIds = useMemo(
		() => selectedMessages.map((message) => message.id),
		[selectedMessages]
	);
	const hasUnreadSelection = selectedMessages.some((message) => !message.read);
	const allVisibleSelected =
		messages.length > 0 &&
		messages.every((message) => selectedIds.includes(message.id));
	return {
		allVisibleSelected,
		hasUnreadSelection,
		selectedIds,
		selectedMessages,
		setSelectedMessages,
	};
}

function useFolderHeading(
	config: MessageFolderPageProps["config"],
	selectedMailbox: ReturnType<typeof useSelectedMailbox>["selectedMailbox"],
	mailboxesLoading: boolean,
	total: number
) {
	const { t } = useLanguage();
	const title = config.titleKey ? t(config.titleKey) : config.title;
	const { counts } = useMessageCounts(selectedMailbox?.id, !mailboxesLoading);
	const headerIcons = config.headerIcons ?? [];
	const folderCount = config.folderId
		? counts.customFolders[config.folderId]
		: counts.folders[config.folder];
	const titleTotal = folderCount?.total ?? total;
	const titleUnread = folderCount?.unread ?? 0;
	const mailboxAddress = getMailboxAddress(selectedMailbox);
	const currentAccountName =
		selectedMailbox?.displayName ?? selectedMailbox?.localPart;

	useEffect(() => {
		const originalTitle = document.title;
		return () => {
			document.title = originalTitle;
		};
	}, []);

	useEffect(() => {
		if (mailboxesLoading) {
			return;
		}
		document.title = formatEmailPageTitle({
			emailAddress: mailboxAddress,
			inbox: config.folder === "inbox" && !config.folderId,
			location: title,
			total: titleTotal,
			unread: titleUnread,
		});
	}, [
		title,
		config.folder,
		config.folderId,
		mailboxAddress,
		mailboxesLoading,
		titleTotal,
		titleUnread,
	]);

	return { currentAccountName, headerIcons, title, titleTotal, titleUnread };
}
function useMessageFolder({
	config,
	compact = false,
	selectedMessageId,
	selection,
}: MessageFolderPageProps) {
	const { t } = useLanguage();
	const { confirm, confirmation } = useMessageConfirmation();
	const { selectedMailbox, isLoading: mailboxesLoading } = useSelectedMailbox();
	const { query } = useMailSearch();
	const isMobile = useIsMobile();
	const [offset, setOffset] = useState(0);
	const [pendingBulkAction, setPendingBulkAction] = useState(false);
	const [emptyingFolder, setEmptyingFolder] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [unreadOnly, setUnreadOnly] = useState(false);
	const [conversationView] = useConversationView();
	const grouped = conversationView && config.folder !== "drafts";
	const listScroller = useRef<HTMLDivElement>(null);
	const listFilters = {
		group: grouped ? ("thread" as const) : undefined,
		limit: pageSize,
		query,
		read: unreadOnly ? ("unread" as const) : ("all" as const),
	};
	const scope = JSON.stringify([
		query,
		selectedMailbox?.id,
		config.folder,
		config.folderId,
		unreadOnly,
		grouped,
	]);
	const [previousScope, setPreviousScope] = useState(scope);
	if (previousScope !== scope) {
		setPreviousScope(scope);
		setOffset(0);
	}
	const {
		messages: firstPage,
		isLoading,
		total,
		limit,
		updateMessages,
		refresh,
	} = useMessages(
		config.folder,
		selectedMailbox?.id,
		{
			...listFilters,
			offset,
		},
		!mailboxesLoading,
		config.folderId
	);
	// Phones scroll one endless list, like Gmail; wider screens keep the paged list.
	const older = useOlderMessages(
		config.folder,
		selectedMailbox?.id,
		listFilters,
		firstPage,
		total,
		isMobile && !mailboxesLoading && offset === 0,
		config.folderId
	);
	const messages = useMemo(
		() => (older.older.length ? [...firstPage, ...older.older] : firstPage),
		[firstPage, older.older]
	);
	const loadMoreSentinel = useRef<HTMLOutputElement>(null);
	const { loadMore } = older;
	useEffect(() => {
		const sentinel = loadMoreSentinel.current;
		if (!sentinel || !older.hasMore) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					loadMore();
				}
			},
			{ root: listScroller.current, rootMargin: "0px 0px 600px 0px" }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [older.hasMore, loadMore]);
	usePageLoading(mailboxesLoading || isLoading);
	const hasActiveFilters = !!query.trim();
	const { headerIcons, titleTotal, titleUnread, currentAccountName, title } =
		useFolderHeading(config, selectedMailbox, mailboxesLoading, total);
	const pageRange = getPageRange(offset, messages.length, total);
	const {
		setSelectedMessages,
		selectedIds,
		hasUnreadSelection,
		allVisibleSelected,
	} = useFolderSelection(messages, isLoading, selection, `${scope}:${offset}`);

	// In conversation view a row stands for every message of its thread in this
	// folder, so actions and drags carry all of them.

	const expandSelectedIds = (ids: string[]) =>
		ids.flatMap(
			(id) =>
				messages.find((message) => message.id === id)?.threadMessageIds ?? [id]
		);

	if (!isLoading && offset !== 0 && messages.length === 0) {
		setOffset(total > 0 ? Math.floor((total - 1) / limit) * limit : 0);
	}

	function updateSelectedMessage(messageId: string, selected: boolean) {
		const message = messages.find((item) => item.id === messageId);
		if (!message) {
			return;
		}

		setSelectedMessages((current) => {
			if (!selected) {
				return current.filter((item) => item.id !== messageId);
			}
			if (current.some((item) => item.id === messageId)) {
				return current;
			}
			return [
				...current,
				{ id: message.id, read: message.read && !(message.threadUnread ?? 0) },
			];
		});
	}

	function changePage(nextOffset: number) {
		setOffset(nextOffset);
		setSelectedMessages([]);
	}

	function toggleAllVisible(selected: boolean) {
		const visibleIds = new Set(messages.map((message) => message.id));
		setSelectedMessages((current) => {
			if (!selected) {
				return current.filter((message) => !visibleIds.has(message.id));
			}

			const next = new Map(current.map((message) => [message.id, message]));
			for (const message of messages) {
				next.set(message.id, {
					id: message.id,
					read: message.read && !(message.threadUnread ?? 0),
				});
			}
			return [...next.values()];
		});
	}

	const permanentDeleteFolder =
		!config.folderId && supportsPermanentDelete(config.folder)
			? config.folder
			: null;
	async function emptyFolder() {
		if (!permanentDeleteFolder || !selectedMailbox?.id) {
			return;
		}
		if (
			!(await confirm(
				getEmptyFolderConfirmText(permanentDeleteFolder, titleTotal, t)
			))
		) {
			return;
		}
		setEmptyingFolder(true);
		return await withCleanup(
			async () => {
				try {
					await emptyMessageFolder(selectedMailbox.id, permanentDeleteFolder);
					setOffset(0);
				} catch (error) {
					console.error(error);
					toast.error(
						t("list.emptyFailed", {
							folder: getPermanentDeleteFolderLabel(permanentDeleteFolder, t),
						})
					);
				}
			},
			() => {
				setEmptyingFolder(false);
			}
		);
	}

	useEffect(() => {
		if (!actionError) {
			return;
		}
		const timer = setTimeout(() => setActionError(null), 6000);
		return () => clearTimeout(timer);
	}, [actionError]);

	async function runSelectedAction(
		action: BulkMessageAction,
		folderId?: string
	) {
		if (selectedIds.length === 0) {
			return;
		}
		if (action === "delete") {
			const ids = expandSelectedIds(selectedIds);
			if (!(await confirm(getPermanentDeleteConfirmText(ids.length, t)))) {
				return;
			}
		}

		setPendingBulkAction(true);
		const previousMessages = messages;
		const getReadState = () => {
			if (action === "read") {
				return true;
			}
			return action === "unread" ? false : null;
		};
		const readValue = getReadState();
		const inboxUnreadDelta =
			readValue === null || config.folder !== "inbox" || config.folderId
				? 0
				: messages
						.filter((message) => selectedIds.includes(message.id))
						.reduce(
							(count, message) =>
								count + getUnreadFlipCount(message, readValue),
							0
						) * (readValue ? -1 : 1);
		if (readValue !== null) {
			updateMessages((current) =>
				current.map((message) =>
					selectedIds.includes(message.id)
						? {
								...message,
								read: readValue,
								...(message.threadMessageIds
									? {
											threadUnread: readValue
												? 0
												: message.threadMessageIds.length,
										}
									: {}),
							}
						: message
				)
			);
			setSelectedMessages((current) =>
				current.map((message) => ({ ...message, read: readValue }))
			);
			if (inboxUnreadDelta) {
				dispatchMessageCountsDelta({ inboxUnreadDelta });
			}
		}
		return await withCleanup(
			async () => {
				try {
					await runBulkMessageAction(
						expandSelectedIds(selectedIds),
						action,
						true,
						folderId
					);
					setSelectedMessages([]);
				} catch (error) {
					if (readValue !== null) {
						updateMessages(previousMessages);
						if (inboxUnreadDelta) {
							dispatchMessageCountsDelta({
								inboxUnreadDelta: -inboxUnreadDelta,
							});
						}
					}
					throw error;
				}
			},
			() => {
				setPendingBulkAction(false);
			}
		);
	}

	async function runSelectedActionReportingErrors(
		action: BulkMessageAction,
		folderId?: string
	) {
		setActionError(null);
		try {
			await runSelectedAction(action, folderId);
		} catch (error) {
			setActionError(
				error instanceof PartialDeleteError
					? t("actions.error.deleteSkipped")
					: t("actions.error.update")
			);
		}
	}

	async function runRowActionReportingErrors(
		messageId: string,
		action: RowMessageAction
	) {
		setActionError(null);
		try {
			await runBulkMessageAction(
				expandSelectedIds([messageId]),
				action,
				action !== "read" && action !== "unread"
			);
		} catch (error) {
			setActionError(
				error instanceof PartialDeleteError
					? t("actions.error.deleteSkipped")
					: t("actions.error.update")
			);
			throw error;
		}
	}

	const getEmptyMessage = () => {
		if (hasActiveFilters) {
			return t("list.noMatch");
		}
		return config.emptyTextKey ? t(config.emptyTextKey) : config.emptyText;
	};
	return {
		actionError,
		allVisibleSelected,
		changePage,
		compact,
		config,
		confirmation,
		currentAccountName,
		emptyFolder,
		emptyingFolder,
		expandSelectedIds,
		getEmptyMessage,
		hasUnreadSelection,
		headerIcons,
		isLoading,
		isMobile,
		limit,
		listScroller,
		loadMoreSentinel,
		messages,
		offset,
		older,
		pageRange,
		pendingBulkAction,
		permanentDeleteFolder,
		refresh,
		runRowActionReportingErrors,
		runSelectedActionReportingErrors,
		selectedIds,
		selectedMessageId,
		setSelectedMessages,
		setUnreadOnly,
		t,
		title,
		titleUnread,
		toggleAllVisible,
		total,
		unreadOnly,
		updateSelectedMessage,
	};
}

function MessageFolderPageControls({
	model,
}: {
	model: ReturnType<typeof useMessageFolder>;
}) {
	const {
		config,
		compact,
		t,
		isMobile,
		selectedIds,
		messages,
		pageRange,
		offset,
		isLoading,
		changePage,
		limit,
		total,
		unreadOnly,
		setUnreadOnly,
		permanentDeleteFolder,
		emptyingFolder,
		emptyFolder,
		headerIcons,
	} = model;
	return (
		<>
			{" "}
			{(selectedIds.length === 0 || compact) && (
				<div className="flex shrink-0 items-center gap-1">
					<span className="text-xs whitespace-nowrap max-md:hidden">
						{t("list.range", {
							end: pageRange.end,
							start: pageRange.start,
							total: pageRange.total,
						})}
					</span>
					<HintTooltip label={t("list.previousPage")}>
						<Button
							variant="ghost"
							size="icon"
							disabled={offset === 0 || isLoading}
							className={clsx(isMobile && "hidden")}
							onClick={() => changePage(Math.max(offset - limit, 0))}
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
							className={clsx(isMobile && "hidden")}
							onClick={() => changePage(offset + limit)}
							aria-label={t("list.nextPage")}
						>
							<ChevronRight data-icon="inline-start" />
						</Button>
					</HintTooltip>
					{config.folder === "inbox" && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("list.showUnreadOnly")}
								>
									<ListFilter data-icon="inline-start" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									<DropdownMenuCheckboxItem
										checked={unreadOnly}
										onCheckedChange={setUnreadOnly}
									>
										{t("list.showUnreadOnly")}
									</DropdownMenuCheckboxItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
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
								onClick={() => emptyFolder()}
								className="shrink-0"
							>
								<Trash2 data-icon="inline-start" />
								{!compact && (
									<span className="max-md:hidden">
										{emptyingFolder
											? t("list.emptying")
											: getEmptyFolderLabel(permanentDeleteFolder, t)}
									</span>
								)}
							</Button>
						</HintTooltip>
					)}
					{!compact &&
						headerIcons.map((Icon, index) => (
							<Icon key={index} className="size-4" />
						))}
				</div>
			)}
		</>
	);
}
function MessageFolderToolbar({
	model,
}: {
	model: ReturnType<typeof useMessageFolder>;
}) {
	const {
		config,
		compact,
		selectedMessageId,
		t,
		title,
		isMobile,
		listScroller,
		selectedIds,
		allVisibleSelected,
		messages,
		toggleAllVisible,
		hasUnreadSelection,
		runSelectedActionReportingErrors,
		setSelectedMessages,
		pendingBulkAction,
		titleUnread,
	} = model;
	return (
		<div
			data-selection-active={selectedIds.length > 0 || undefined}
			className={`flex h-14 shrink-0 items-center justify-between border-b border-border ${compact ? "px-4" : "px-4.5 md:px-6"}`}
		>
			{selectedMessageId ? (
				<h2 className="sr-only">{title}</h2>
			) : (
				<h1 className="sr-only">{title}</h1>
			)}
			<div className="flex min-w-0 flex-1 items-center gap-4">
				{/* Phones select with a long press or the avatar, and their selection bar leads with its close button. */}
				{!isMobile && (
					<HintTooltip label={t("list.selectAll")}>
						<Checkbox
							checked={allVisibleSelected}
							disabled={messages.length === 0}
							onCheckedChange={(checked) => toggleAllVisible(checked === true)}
							className="relative after:absolute after:-inset-3.5"
							aria-label={t("list.selectAll")}
						/>
					</HintTooltip>
				)}
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
					// iOS scrolls to the top when the status bar is tapped, but only for the page itself; lists here
					// scroll their own container, so tapping the title does it instead.
					<Button
						type="button"
						variant="plain"
						size="none"
						className="min-w-0"
						onClick={() =>
							listScroller.current?.scrollTo({ behavior: "smooth", top: 0 })
						}
					>
						<span className="flex min-w-0 items-baseline gap-2 pl-1 max-md:pl-0">
							<span className="truncate font-semibold max-md:text-2xl max-md:leading-7 max-md:tracking-tight">
								{title}
							</span>
							{isMobile && titleUnread > 0 && (
								<span className="shrink-0 text-sm font-medium text-signal tabular-nums">
									{titleUnread}
								</span>
							)}
						</span>
					</Button>
				)}
			</div>
			<MessageFolderPageControls model={model} />
		</div>
	);
}

export function MessageFolderPage(props: MessageFolderPageProps) {
	const model = useMessageFolder(props);
	const {
		config,
		compact,
		selectedMessageId,
		t,
		confirmation,
		title,
		isMobile,
		listScroller,
		selectedIds,
		messages,
		isLoading,
		actionError,
		currentAccountName,
		updateSelectedMessage,
		runRowActionReportingErrors,
		expandSelectedIds,
		older,
		loadMoreSentinel,
		getEmptyMessage,
	} = model;
	return (
		<div className="flex h-full min-h-0 flex-col">
			{confirmation}
			<MessageFolderToolbar model={model} />

			{actionError && (
				<Alert variant="destructive" className="shrink-0">
					<AlertDescription>{actionError}</AlertDescription>
				</Alert>
			)}

			<PullToRefresh scroller={listScroller} onRefresh={reloadPage}>
				<div
					ref={listScroller}
					className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain"
				>
					<ul aria-label={title} className="divide-y divide-border">
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
								onMessageAction={runRowActionReportingErrors}
								dragMessageIds={expandSelectedIds(
									selectedIds.includes(message.id) ? selectedIds : [message.id]
								)}
								selectionMode={isMobile && selectedIds.length > 0}
							/>
						))}
					</ul>
					{older.hasMore && (
						<output
							ref={loadMoreSentinel}

							className="flex h-16 items-center justify-center"
						>
							<Spinner />
							<span className="sr-only">{t("common.loading")}</span>
						</output>
					)}
					{isLoading && messages.length === 0 && (
						<SkeletonRows compact={compact || isMobile} />
					)}
					{!isLoading && messages.length === 0 && (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<config.icon />
								</EmptyMedia>
								<EmptyTitle>{title}</EmptyTitle>
								<EmptyDescription>{getEmptyMessage()}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</div>
			</PullToRefresh>
		</div>
	);
}
