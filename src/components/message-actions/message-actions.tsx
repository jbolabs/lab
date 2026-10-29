"use client";

import { createElement, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Archive, Ban, BellOff, Clock, FileCode2, Forward, Mail, MailOpen, Reply, ReplyAll, ShieldAlert, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useCompose } from "@/components/compose/compose-context";
import { useMessageConfirmation } from "@/components/messages/use-message-confirmation";
import { MessageSourceDialog } from "@/components/messages/message-source-dialog";
import { MessageActionMenu } from "@/components/messages/message-action-menu";
import { useMessageListVisibility } from "@/components/messages/message-list-visibility";
import { MessageSnoozeDialog } from "./message-snooze-dialog";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { useHotkeys, useShortcuts } from "@/components/shortcuts";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { HintTooltip } from "@/components/hint-tooltip";
import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import type { MessageActionsProps, ReplyMode } from "./types";
import { getPermanentDeleteConfirmText, PartialDeleteError, supportsPermanentDelete } from "@/lib/messages/permanent-delete-utils";
import {
	confirmTrashWithoutUnsubscribe,
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

export function MessageActions({
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
	ownAddresses = [],
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

	const runAction = useCallback(async (action: BulkMessageAction) => {
		setMoreOpen(false);
		setPendingAction(action);
		setError(null);
		try {
			await runSingleMessageAction(messageId, action);
			const redirect = getMessageActionRedirect(action, listHref);
			if (redirect) router.push(redirect);
			router.refresh();
		} catch {
			setError(t("actions.error.update"));
		} finally {
			setPendingAction(null);
		}
	}, [messageId, listHref, router, t]);

	// In Trash and Spam the delete button removes the message for good instead of
	// being a no-op, after the user confirms.
	const canDeleteForever = supportsPermanentDelete(status);
	const deleteForever = useCallback(async () => {
		if (!(await confirm(getPermanentDeleteConfirmText(1, t)))) return;
		setMoreOpen(false);
		setPendingAction("delete");
		setError(null);
		try {
			await runSingleMessageAction(messageId, "delete");
			router.push(getMessageBackHref(direction, status));
			router.refresh();
		} catch (deleteError) {
			setError(deleteError instanceof PartialDeleteError ? t("actions.error.deleteSkipped") : t("actions.error.delete"));
			setPendingAction(null);
		}
	}, [messageId, direction, status, router, t, confirm]);
	const onTrashClick = () => (canDeleteForever ? void deleteForever() : void runAction("trash"));
	const trashLabel = canDeleteForever ? t("common.deleteForever") : t("actions.moveToTrash");

	const replyable = useMemo(() => message ?? {
		direction,
		fromAddr: senderAddress,
		toAddr: "",
		ccAddr: null,
		replyTo: null,
		providerMessageId: null,
		references: null,
		threadId: null,
	}, [message, direction, senderAddress]);
	const canReplyAll = hasAdditionalRecipients(replyable, ownAddresses);

	const handleReply = useCallback(async (mode: ReplyMode) => {
		setPendingAction(mode);
		setError(null);
		try {
			const draftId = await createReplyDraft({
				mailboxId,
				senderAddress,
				ownAddress,
				subject,
				bodyText,
				bodyHtml,
				sentAt: messageMeta?.createdAt,
				recipients: getReplyRecipients(replyable, ownAddresses, mode),
				threading: getReplyThreading(replyable),
			});
			openDraftComposer(draftId);
		} catch (replyError) {
			setError(replyError instanceof Error ? replyError.message : t("message.error.reply"));
		} finally {
			setPendingAction(null);
		}
	}, [mailboxId, senderAddress, ownAddress, subject, bodyText, bodyHtml, messageMeta?.createdAt, replyable, ownAddresses, openDraftComposer, t]);

	const shortcuts = useMemo(
		() => [
			{
				key: "e",
				label: t("shortcut.archiveMessage"),
				category: "Actions" as const,
				action: () => {
					if (status !== "archived") void runAction("archive");
				},
			},
			{
				key: "y",
				label: t("shortcut.archiveMessage"),
				category: "Actions" as const,
				action: () => {
					if (status !== "archived") void runAction("archive");
				},
			},
			{
				key: "#",
				label: t("shortcut.moveToTrash"),
				category: "Actions" as const,
				action: () => {
					if (status !== "trash") void runAction("trash");
				},
			},
			{
				key: "r",
				label: t("shortcut.replyToMessage"),
				category: "Composing" as const,
				action: () => void handleReply("reply"),
			},
			{
				key: "!",
				label: t("shortcut.reportSpam"),
				category: "Actions" as const,
				action: () => {
					if (status !== "spam" && direction === "inbound") void runAction("spam");
				},
			},
			{
				key: "u",
				label: t("shortcut.backToList"),
				category: "Navigation" as const,
				action: () => router.back(),
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

		if (!confirmTrashWithoutUnsubscribe()) return;
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
		if (!message || !messageMeta) return;
		setPendingAction("forward");
		setError(null);
		try {
			const draftId = await createForwardDraft({
				mailboxId,
				ownAddress,
				message: { ...message, ...messageMeta },
				bodyText,
				bodyHtml,
			});
			openDraftComposer(draftId);
		} catch (forwardError) {
			setError(forwardError instanceof Error ? forwardError.message : t("message.error.forward"));
		} finally {
			setPendingAction(null);
		}
	}
	async function onBlockContact() {
		setMoreOpen(false);
		setError(null);
		if (!mailboxId) {
			setError(t("message.error.block"));
			return;
		}

		setPendingAction("block");
		try {
			await blockMessageContact({ mailboxId, senderAddress });
			await runSingleMessageAction(messageId, "trash");
			router.push(listHref);
			router.refresh();
		} catch (blockError) {
			setError(blockError instanceof Error ? blockError.message : t("message.error.block"));
		} finally {
			setPendingAction(null);
		}
	}

	const disabled = pendingAction !== null;
	const markAction: BulkMessageAction = read ? "unread" : "read";
	const moveActions = getMoveMessageActions(status, direction);

	return (
		<div className="flex flex-wrap items-center gap-3 text-muted-foreground flex-1 min-w-0">
			{confirmation}
			{error && <span role="alert" className="text-xs text-red-600">{error}</span>}

			{isMobile && <div role="toolbar" aria-label={t("message.reply")} className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-background pl-4 pr-40 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))]">
				<Button className="min-h-11 flex-1" disabled={disabled} onClick={() => void handleReply("reply")}><Reply data-icon="inline-start" />{t("message.reply")}</Button>
				{message && messageMeta && <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label={t("message.forward")} disabled={disabled} onClick={() => void handleForward()}><Forward data-icon="inline-start" /></Button>}
			</div>}
			{isMobile && (
				<>
					<Button
						variant="ghost"
						size="icon"
					className="pointer-coarse:size-11"
						aria-label={trashLabel}
						disabled={disabled}
						onClick={onTrashClick}
					>
						<Trash2 data-icon="inline-start" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
					className="pointer-coarse:size-11"
						aria-label={t("common.reportSpam")}
						disabled={disabled || status === "spam" || direction !== "inbound"}
						onClick={() => runAction("spam")}
					>
						<ShieldAlert data-icon="inline-start" />
					</Button>
				</>
			)}
			{!isMobile && (
				<>
			<HintTooltip label={shortcutsEnabled ? t("actions.archiveHint") : t("common.archive")}>
				<Button
					variant="ghost"
					size="icon"
					className="pointer-coarse:size-11"
					aria-label={shortcutsEnabled ? t("actions.archiveHint") : t("common.archive")}
					disabled={disabled || status === "archived"}
					onClick={() => runAction("archive")}
				>
					<Archive data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={shortcutsEnabled ? t("actions.reportSpamHint") : t("common.reportSpam")}>
				<Button
					variant="ghost"
					size="icon"
					className="pointer-coarse:size-11"
					aria-label={shortcutsEnabled ? t("actions.reportSpamHint") : t("common.reportSpam")}
					disabled={disabled || status === "spam" || direction !== "inbound"}
					onClick={() => runAction("spam")}
				>
					<ShieldAlert data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={canDeleteForever ? t("common.deleteForever") : shortcutsEnabled ? t("actions.deleteHint") : t("common.delete")}>
				<Button
					variant="ghost"
					size="icon"
					className="pointer-coarse:size-11"
					aria-label={canDeleteForever ? trashLabel : shortcutsEnabled ? t("actions.moveToTrashHint") : t("actions.moveToTrash")}
					disabled={disabled}
					onClick={onTrashClick}

				>
					<Trash2 data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<Separator orientation="vertical" className="mx-1 h-5" />


			<HintTooltip label={shortcutsEnabled ? t("actions.replyHint") : t("message.reply")}>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="pointer-coarse:size-11"
					aria-label={shortcutsEnabled ? t("actions.replyHint") : t("message.reply")}
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
					className="pointer-coarse:size-11"
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
					className="pointer-coarse:size-11"
						aria-label={t("message.forward")}
						disabled={disabled}
						onClick={() => void handleForward()}
					>
						<Forward data-icon="inline-start" />
					</Button>
				</HintTooltip>
			)}

			<HintTooltip label={read ? t("common.markUnread") : t("common.markRead")}>
				<Button
					variant="ghost"
					size="icon"
					className="pointer-coarse:size-11"
					aria-label={read ? t("common.markUnread") : t("common.markRead")}
					disabled={disabled}
					onClick={() => runAction(markAction)}
				>
					{read ? <Mail data-icon="inline-start" /> : <MailOpen data-icon="inline-start" />}
				</Button>
			</HintTooltip>
				</>
			)}
			<MessageActionMenu open={moreOpen} onOpenChange={setMoreOpen} disabled={disabled} actions={[
				...(isMobile ? [
					{ label: t("common.archive"), icon: <Archive data-icon="inline-start" />, disabled: status === "archived", onSelect: () => void runAction("archive") },
					{ label: t("message.reply"), icon: <Reply data-icon="inline-start" />, onSelect: () => void handleReply("reply") },
					...(canReplyAll ? [{ label: t("message.replyAll"), icon: <ReplyAll data-icon="inline-start" />, onSelect: () => void handleReply("replyAll") }] : []),
					...(message && messageMeta ? [{ label: t("message.forward"), icon: <Forward data-icon="inline-start" />, onSelect: () => void handleForward() }] : []),
					{ label: read ? t("common.markUnread") : t("common.markRead"), icon: <Mail data-icon="inline-start" />, onSelect: () => void runAction(markAction) },
				] : []),
				...(direction === "inbound" && status === "received" ? [{ label: t("common.snooze"), icon: <Clock data-icon="inline-start" />, onSelect: () => setSnoozeOpen(true) }] : []),
				...(direction === "inbound" ? [
					{ label: t("actions.unsubscribe"), icon: <BellOff data-icon="inline-start" />, disabled: !unsubscribeUrl && status === "trash", onSelect: () => void onUnsubscribe() },
					{ label: t("message.blockContact"), icon: <Ban data-icon="inline-start" />, onSelect: () => void onBlockContact() },
				] : []),
				{ label: t("message.showOriginal"), icon: <FileCode2 data-icon="inline-start" />, onSelect: () => setSourceOpen(true) },
				...moveActions.map(item => ({ label: t(item.labelKey), icon: createElement(item.icon, { "data-icon": "inline-start" }), onSelect: () => void runAction(item.action) })),
			]} />

			<MessageSourceDialog messageId={messageId} open={sourceOpen} onOpenChange={setSourceOpen} />
			<MessageSnoozeDialog messageId={messageId} open={snoozeOpen} onOpenChange={setSnoozeOpen} />

			<span className="flex-1" />
		</div>
	);
}
