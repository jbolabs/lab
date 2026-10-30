"use client";

import {
	Archive,
	Ban,
	BellOff,
	Clock,
	FileCode2,
	Forward,
	Mail,
	MailOpen,
	Reply,
	ReplyAll,
	ShieldAlert,
	Trash2,
} from "lucide-react";
import { createElement, useState, useMemo, useCallback } from "react";

import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import { useCompose } from "@/components/compose/compose-context";
import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { MessageActionMenu } from "@/components/messages/message-action-menu";
import { useMessageListVisibility } from "@/components/messages/message-list-visibility";
import { MessageSourceDialog } from "@/components/messages/message-source-dialog";
import { useMessageConfirmation } from "@/components/messages/use-message-confirmation";
import { useShortcuts } from "@/components/shortcuts/shortcuts-context";
import { useHotkeys } from "@/components/shortcuts/use-hotkeys";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { withCleanup } from "@/lib/async-cleanup";
import {
	getPermanentDeleteConfirmText,
	PartialDeleteError,
	supportsPermanentDelete,
} from "@/lib/messages/permanent-delete-utils";
import { useRouter } from "@/lib/navigation";

import { MessageSnoozeDialog } from "./message-snooze-dialog";
import type { MessageActionsProps, ReplyMode } from "./types";
import {
	trashWithoutUnsubscribeText,
	blockMessageContact,
	createForwardDraft,
	createReplyDraft,
	createTrashSenderRule,
	getMessageActionRedirect,
	getMessageBackHref,
	getMoveMessageActions,
	getReplyRecipients,
	getReplyThreading,
	hasAdditionalRecipients,
	openUnsubscribeUrl,
	runSingleMessageAction,
} from "./utils";

const emptyOwnAddresses: string[] = [];

function useMessageActions({
	messageId,
	mailboxId,
	senderAddress,
	direction,
	status,
	read,
	unsubscribeUrl,
	subject,
	bodyText,
	ownAddress,
	ownAddresses = emptyOwnAddresses,
	message,
	messageMeta,
	bodyHtml,
}: MessageActionsProps) {
	const { t } = useLanguage();
	const router = useRouter();
	const { confirm, confirmation } = useMessageConfirmation();
	const isMobile = useIsMobile();
	const { openDraftComposer } = useCompose();
	const { backHref: listHref } = useMessageListVisibility();
	const { shortcutsEnabled } = useShortcuts();
	const [pendingAction, setPendingAction] = useState<
		BulkMessageAction | "unsubscribe" | ReplyMode | "forward" | "block" | null
	>(null);
	const [error, setError] = useState<string | null>(null);
	const [moreOpen, setMoreOpen] = useState(false);
	const [sourceOpen, setSourceOpen] = useState(false);
	const [snoozeOpen, setSnoozeOpen] = useState(false);

	const runAction = useCallback(
		async (action: BulkMessageAction) => {
			setMoreOpen(false);
			setPendingAction(action);
			setError(null);
			return await withCleanup(
				async () => {
					try {
						await runSingleMessageAction(messageId, action);
						const redirect = getMessageActionRedirect(action, listHref);
						if (redirect) {
							router.push(redirect);
						}
						router.refresh();
					} catch {
						setError(t("actions.error.update"));
					}
				},
				() => {
					setPendingAction(null);
				}
			);
		},
		[messageId, listHref, router, t]
	);

	// In Trash and Spam the delete button removes the message for good instead of
	// being a no-op, after the user confirms.
	const canDeleteForever = supportsPermanentDelete(status);
	const deleteForever = useCallback(async () => {
		if (!(await confirm(getPermanentDeleteConfirmText(1, t)))) {
			return;
		}
		setMoreOpen(false);
		setPendingAction("delete");
		setError(null);
		try {
			await runSingleMessageAction(messageId, "delete");
			router.push(getMessageBackHref(direction, status));
			router.refresh();
		} catch (deleteError) {
			setError(
				deleteError instanceof PartialDeleteError
					? t("actions.error.deleteSkipped")
					: t("actions.error.delete")
			);
			setPendingAction(null);
		}
	}, [messageId, direction, status, router, t, confirm]);
	const onTrashClick = () =>
		canDeleteForever ? deleteForever() : runAction("trash");
	const trashLabel = canDeleteForever
		? t("common.deleteForever")
		: t("actions.moveToTrash");

	const replyable = useMemo(
		() =>
			message ?? {
				ccAddr: null,
				direction,
				fromAddr: senderAddress,
				providerMessageId: null,
				references: null,
				replyTo: null,
				threadId: null,
				toAddr: "",
			},
		[message, direction, senderAddress]
	);
	const canReplyAll = hasAdditionalRecipients(replyable, ownAddresses);

	const handleReply = useCallback(
		async (mode: ReplyMode) => {
			setPendingAction(mode);
			setError(null);
			return await withCleanup(
				async () => {
					try {
						const draftId = await createReplyDraft({
							bodyHtml,
							bodyText,
							mailboxId,
							ownAddress,
							recipients: getReplyRecipients(replyable, ownAddresses, mode),
							senderAddress,
							sentAt: messageMeta?.createdAt,
							subject,
							threading: getReplyThreading(replyable),
						});
						openDraftComposer(draftId);
					} catch (replyError) {
						setError(
							replyError instanceof Error
								? replyError.message
								: t("message.error.reply")
						);
					}
				},
				() => {
					setPendingAction(null);
				}
			);
		},
		[
			mailboxId,
			senderAddress,
			ownAddress,
			subject,
			bodyText,
			bodyHtml,
			messageMeta,
			replyable,
			ownAddresses,
			openDraftComposer,
			t,
		]
	);

	const shortcuts = useMemo(
		() => [
			{
				action: () => {
					if (status !== "archived") {
						void runAction("archive");
					}
				},
				category: "Actions" as const,
				key: "e",
				label: t("shortcut.archiveMessage"),
			},
			{
				action: () => {
					if (status !== "archived") {
						void runAction("archive");
					}
				},
				category: "Actions" as const,
				key: "y",
				label: t("shortcut.archiveMessage"),
			},
			{
				action: () => {
					if (status !== "trash") {
						void runAction("trash");
					}
				},
				category: "Actions" as const,
				key: "#",
				label: t("shortcut.moveToTrash"),
			},
			{
				action: () => handleReply("reply"),
				category: "Composing" as const,
				key: "r",
				label: t("shortcut.replyToMessage"),
			},
			{
				action: () => {
					if (status !== "spam" && direction === "inbound") {
						void runAction("spam");
					}
				},
				category: "Actions" as const,
				key: "!",
				label: t("shortcut.reportSpam"),
			},
			{
				action: () => router.back(),
				category: "Navigation" as const,
				key: "u",
				label: t("shortcut.backToList"),
			},
		],
		[status, direction, runAction, handleReply, router, t]
	);

	useHotkeys(shortcuts, { enabled: shortcutsEnabled });

	async function onUnsubscribe() {
		setMoreOpen(false);
		setError(null);
		if (unsubscribeUrl) {
			openUnsubscribeUrl(unsubscribeUrl);
			return;
		}

		if (
			!(await confirm(trashWithoutUnsubscribeText, {
				action: t("actions.unsubscribe"),
				title: t("actions.unsubscribe"),
			}))
		) {
			return;
		}
		setPendingAction("unsubscribe");
		if (!mailboxId) {
			setError(t("actions.error.trashRule"));
			setPendingAction(null);
			return;
		}

		try {
			await createTrashSenderRule({ mailboxId, senderAddress });
			await runAction("trash");
		} catch {
			setError(t("actions.error.trashRule"));
			setPendingAction(null);
		}
	}

	async function handleForward() {
		if (!message || !messageMeta) {
			return;
		}
		setPendingAction("forward");
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const draftId = await createForwardDraft({
						bodyHtml,
						bodyText,
						mailboxId,
						message: { ...message, ...messageMeta },
						ownAddress,
					});
					openDraftComposer(draftId);
				} catch (forwardError) {
					setError(
						forwardError instanceof Error
							? forwardError.message
							: t("message.error.forward")
					);
				}
			},
			() => {
				setPendingAction(null);
			}
		);
	}
	async function onBlockContact() {
		setMoreOpen(false);
		setError(null);
		if (!mailboxId) {
			setError(t("message.error.block"));
			return;
		}

		setPendingAction("block");
		return await withCleanup(
			async () => {
				try {
					await blockMessageContact({ mailboxId, senderAddress });
					await runSingleMessageAction(messageId, "trash");
					router.push(listHref);
					router.refresh();
				} catch (blockError) {
					setError(
						blockError instanceof Error
							? blockError.message
							: t("message.error.block")
					);
				}
			},
			() => {
				setPendingAction(null);
			}
		);
	}

	const disabled = pendingAction !== null;
	const markAction: BulkMessageAction = read ? "unread" : "read";
	const moveActions = getMoveMessageActions(status, direction);

	const getArchiveLabel = () => {
		if (canDeleteForever) {
			return t("common.deleteForever");
		}
		return shortcutsEnabled ? t("actions.deleteHint") : t("common.delete");
	};
	const getTrashLabel = () => {
		if (canDeleteForever) {
			return trashLabel;
		}
		return shortcutsEnabled
			? t("actions.moveToTrashHint")
			: t("actions.moveToTrash");
	};
	return {
		canReplyAll,
		confirmation,
		direction,
		disabled,
		error,
		getArchiveLabel,
		getTrashLabel,
		handleForward,
		handleReply,
		isMobile,
		mailboxId,
		markAction,
		message,
		messageId,
		messageMeta,
		moreOpen,
		moveActions,
		onBlockContact,
		onTrashClick,
		onUnsubscribe,
		read,
		runAction,
		senderAddress,
		setMoreOpen,
		setSnoozeOpen,
		setSourceOpen,
		shortcutsEnabled,
		snoozeOpen,
		sourceOpen,
		status,
		t,
		trashLabel,
		unsubscribeUrl,
	};
}

function DesktopMessageActions({
	model,
}: {
	model: ReturnType<typeof useMessageActions>;
}) {
	const {
		t,
		disabled,
		handleReply,
		canReplyAll,
		message,
		messageMeta,
		handleForward,
		status,
		runAction,
		onTrashClick,
		read,
		markAction,
		shortcutsEnabled,
		direction,
		getArchiveLabel,
		getTrashLabel,
	} = model;
	return (
		<>
			<HintTooltip
				label={
					shortcutsEnabled ? t("actions.archiveHint") : t("common.archive")
				}
			>
				<Button
					variant="ghost"
					size="icon"
					aria-label={
						shortcutsEnabled ? t("actions.archiveHint") : t("common.archive")
					}
					disabled={disabled || status === "archived"}
					onClick={() => runAction("archive")}
				>
					<Archive data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip
				label={
					shortcutsEnabled
						? t("actions.reportSpamHint")
						: t("common.reportSpam")
				}
			>
				<Button
					variant="ghost"
					size="icon"
					aria-label={
						shortcutsEnabled
							? t("actions.reportSpamHint")
							: t("common.reportSpam")
					}
					disabled={disabled || status === "spam" || direction !== "inbound"}
					onClick={() => runAction("spam")}
				>
					<ShieldAlert data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={getArchiveLabel()}>
				<Button
					variant="ghost"
					size="icon"
					aria-label={getTrashLabel()}
					disabled={disabled}
					onClick={onTrashClick}
				>
					<Trash2 data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<Separator orientation="vertical" className="mx-1" />

			<HintTooltip
				label={shortcutsEnabled ? t("actions.replyHint") : t("message.reply")}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={
						shortcutsEnabled ? t("actions.replyHint") : t("message.reply")
					}
					disabled={disabled}
					onClick={() => handleReply("reply")}
				>
					<Reply data-icon="inline-start" />
				</Button>
			</HintTooltip>
			{canReplyAll && (
				<HintTooltip label={t("message.replyAll")}>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={t("message.replyAll")}
						disabled={disabled}
						onClick={() => handleReply("replyAll")}
					>
						<ReplyAll data-icon="inline-start" />
					</Button>
				</HintTooltip>
			)}
			{message && messageMeta && (
				<HintTooltip label={t("message.forward")}>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={t("message.forward")}
						disabled={disabled}
						onClick={() => handleForward()}
					>
						<Forward data-icon="inline-start" />
					</Button>
				</HintTooltip>
			)}

			<HintTooltip label={read ? t("common.markUnread") : t("common.markRead")}>
				<Button
					variant="ghost"
					size="icon"
					aria-label={read ? t("common.markUnread") : t("common.markRead")}
					disabled={disabled}
					onClick={() => runAction(markAction)}
				>
					{read ? (
						<Mail data-icon="inline-start" />
					) : (
						<MailOpen data-icon="inline-start" />
					)}
				</Button>
			</HintTooltip>
		</>
	);
}
export function MessageActions(props: MessageActionsProps) {
	const model = useMessageActions(props);
	const {
		t,
		confirmation,
		error,
		isMobile,
		disabled,
		handleReply,
		canReplyAll,
		message,
		messageMeta,
		handleForward,
		status,
		runAction,
		trashLabel,
		onTrashClick,
		read,
		markAction,
		direction,
		moreOpen,
		setMoreOpen,
		moveActions,
		onBlockContact,
		onUnsubscribe,
		setSnoozeOpen,
		setSourceOpen,
		sourceOpen,
		messageId,
		snoozeOpen,
		unsubscribeUrl,
	} = model;
	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-muted-foreground">
			{confirmation}
			{error && (
				<span role="alert" className="text-xs text-destructive">
					{error}
				</span>
			)}

			{/* Phones: Gmail's reply bar. The Compose button is hidden while reading, so the bar spans the width. */}
			{isMobile && (
				<div
					role="toolbar"
					aria-label={t("message.reply")}
					className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-background px-4 pt-2 pb-safe-add-2"
				>
					<Button
						className="flex-1"
						disabled={disabled}
						onClick={() => handleReply("reply")}
					>
						<Reply data-icon="inline-start" />
						{t("message.reply")}
					</Button>
					{canReplyAll && (
						<Button
							variant="outline"
							size="icon"
							className="shrink-0"
							aria-label={t("message.replyAll")}
							disabled={disabled}
							onClick={() => handleReply("replyAll")}
						>
							<ReplyAll data-icon="inline-start" />
						</Button>
					)}
					{message && messageMeta && (
						<Button
							variant="outline"
							size="icon"
							className="shrink-0"
							aria-label={t("message.forward")}
							disabled={disabled}
							onClick={() => handleForward()}
						>
							<Forward data-icon="inline-start" />
						</Button>
					)}
				</div>
			)}
			{/* Phones: the reader toolbar Gmail uses, archive, trash and read state; the rest is under More. */}
			{isMobile && (
				<>
					<Button
						variant="ghost"
						size="icon"
						aria-label={t("common.archive")}
						disabled={disabled || status === "archived"}
						onClick={() => runAction("archive")}
					>
						<Archive data-icon="inline-start" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={trashLabel}
						disabled={disabled}
						onClick={onTrashClick}
					>
						<Trash2 data-icon="inline-start" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={read ? t("common.markUnread") : t("common.markRead")}
						disabled={disabled}
						onClick={() => runAction(markAction)}
					>
						{read ? (
							<Mail data-icon="inline-start" />
						) : (
							<MailOpen data-icon="inline-start" />
						)}
					</Button>
				</>
			)}
			{!isMobile && <DesktopMessageActions model={model} />}
			<MessageActionMenu
				open={moreOpen}
				onOpenChange={setMoreOpen}
				disabled={disabled}
				actions={[
					...(direction === "inbound" && status === "received"
						? [
								{
									icon: <Clock data-icon="inline-start" />,
									label: t("common.snooze"),
									onSelect: () => setSnoozeOpen(true),
								},
							]
						: []),
					...(direction === "inbound"
						? [
								{
									disabled: !unsubscribeUrl && status === "trash",
									icon: <BellOff data-icon="inline-start" />,
									label: t("actions.unsubscribe"),
									onSelect: () => onUnsubscribe(),
								},
								{
									icon: <Ban data-icon="inline-start" />,
									label: t("message.blockContact"),
									onSelect: () => onBlockContact(),
								},
							]
						: []),
					{
						icon: <FileCode2 data-icon="inline-start" />,
						label: t("message.showOriginal"),
						onSelect: () => setSourceOpen(true),
					},
					...moveActions.map((item) => ({
						icon: createElement(item.icon, { "data-icon": "inline-start" }),
						label: t(item.labelKey),
						onSelect: () => runAction(item.action),
					})),
				]}
			/>

			<MessageSourceDialog
				messageId={messageId}
				open={sourceOpen}
				onOpenChange={setSourceOpen}
			/>
			<MessageSnoozeDialog
				messageId={messageId}
				open={snoozeOpen}
				onOpenChange={setSnoozeOpen}
			/>

			<span className="flex-1" />
		</div>
	);
}
