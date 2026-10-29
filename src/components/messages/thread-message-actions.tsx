"use client";

import {
	Ban,
	FileCode2,
	Forward,
	Mail,
	Reply,
	ReplyAll,
	Star,
} from "lucide-react";
import { createElement, useState } from "react";

import { getOwnAddressForMessage } from "@/app/(dashboard)/inbox/[messageId]/utils";
import { useCompose } from "@/components/compose/compose-context";
import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import type { ReplyMode } from "@/components/message-actions/types";
import {
	blockMessageContact,
	createForwardDraft,
	createReplyDraft,
	getMoveMessageActions,
	getReplyRecipients,
	getReplyThreading,
	hasAdditionalRecipients,
	runSingleMessageAction,
} from "@/components/message-actions/utils";
import { MessageSourceDialog } from "@/components/messages/message-source-dialog";
import { Button } from "@/components/ui/button";
import { useMessageField } from "@/hooks/use-message-field";
import { withCleanup } from "@/lib/async-cleanup";

import { MessageActionMenu } from "./message-action-menu";
import { toggleMessageStar } from "./message-list-row-actions-utils";
import type { ThreadMessageActionsProps } from "./thread-message-actions-types";

const EMPTY_ADDRESSES: string[] = [];

export function ThreadMessageActions({
	message,
	mailboxId,
	ownAddress,
	ownAddresses = EMPTY_ADDRESSES,
	starOnly = false,
}: ThreadMessageActionsProps) {
	const { t } = useLanguage();
	const { openDraftComposer } = useCompose();
	const [starred, setStarred] = useMessageField(message.starred);
	const [moreOpen, setMoreOpen] = useState(false);
	const [sourceOpen, setSourceOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const canReplyAll = hasAdditionalRecipients(message, ownAddresses);
	const moveActions = getMoveMessageActions(message.status, message.direction);
	const replyFromAddress =
		ownAddresses.length > 0
			? getOwnAddressForMessage(message, ownAddresses)
			: ownAddress;

	const [previousStarOnly, setPreviousStarOnly] = useState(starOnly);
	if (previousStarOnly !== starOnly) {
		setPreviousStarOnly(starOnly);
		if (starOnly) {
			setMoreOpen(false);
		}
	}

	async function onToggleStar() {
		setPending(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const updated = await toggleMessageStar(message.id);
					setStarred(updated.starred);
				} catch (nextError) {
					setError(
						nextError instanceof Error
							? nextError.message
							: t("message.error.star")
					);
				}
			},
			() => {
				setPending(false);
			}
		);
	}

	async function onReply(mode: ReplyMode) {
		setMoreOpen(false);
		setPending(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const draftId = await createReplyDraft({
						bodyHtml: message.htmlBody,
						bodyText: message.textBody,
						mailboxId,
						ownAddress: replyFromAddress,
						recipients: getReplyRecipients(message, ownAddresses, mode),
						senderAddress: message.fromAddr,
						sentAt: message.createdAt,
						subject: message.subject,
						threading: getReplyThreading(message),
					});
					openDraftComposer(draftId);
				} catch (nextError) {
					setError(
						nextError instanceof Error
							? nextError.message
							: t("message.error.reply")
					);
				}
			},
			() => {
				setPending(false);
			}
		);
	}

	async function onForward() {
		setMoreOpen(false);
		setPending(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const draftId = await createForwardDraft({
						bodyHtml: message.htmlBody,
						bodyText: message.textBody,
						mailboxId,
						message,
						ownAddress: replyFromAddress,
					});
					openDraftComposer(draftId);
				} catch (nextError) {
					setError(
						nextError instanceof Error
							? nextError.message
							: t("message.error.forward")
					);
				}
			},
			() => {
				setPending(false);
			}
		);
	}

	async function onMessageAction(
		action: Parameters<typeof runSingleMessageAction>[1]
	) {
		setMoreOpen(false);
		setPending(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					await runSingleMessageAction(message.id, action);
				} catch (nextError) {
					setError(
						nextError instanceof Error
							? nextError.message
							: t("message.error.update")
					);
				}
			},
			() => {
				setPending(false);
			}
		);
	}

	async function onBlock() {
		if (!mailboxId) {
			return;
		}
		setMoreOpen(false);
		setPending(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					await blockMessageContact({
						mailboxId,
						senderAddress: message.fromAddr,
					});
					await runSingleMessageAction(message.id, "trash");
				} catch (nextError) {
					setError(
						nextError instanceof Error
							? nextError.message
							: t("message.error.block")
					);
				}
			},
			() => {
				setPending(false);
			}
		);
	}

	return (
		<div className="flex items-center gap-0.5">
			{error && (
				<span
					role="alert"
					className="mr-1 max-w-32 truncate text-xs text-destructive"
					title={error}
				>
					{error}
				</span>
			)}
			<HintTooltip
				label={starred ? t("message.removeStar") : t("message.star")}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={starred ? t("message.removeStar") : t("message.star")}
					aria-pressed={starred}
					disabled={pending}
					onClick={() => onToggleStar()}
				>
					<Star className={starred ? "fill-current" : ""} />
				</Button>
			</HintTooltip>
			{!starOnly && (
				<>
					<HintTooltip label={t("message.reply")}>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={t("message.reply")}
							disabled={pending}
							onClick={() => onReply("reply")}
						>
							<Reply data-icon="inline-start" />
						</Button>
					</HintTooltip>
					<MessageActionMenu
						open={moreOpen}
						onOpenChange={setMoreOpen}
						disabled={pending}
						actions={[
							{
								icon: <Reply data-icon="inline-start" />,
								label: t("message.reply"),
								onSelect: () => onReply("reply"),
							},
							...(canReplyAll
								? [
										{
											icon: <ReplyAll data-icon="inline-start" />,
											label: t("message.replyAll"),
											onSelect: () => onReply("replyAll"),
										},
									]
								: []),
							{
								icon: <Forward data-icon="inline-start" />,
								label: t("message.forward"),
								onSelect: () => onForward(),
							},
							{
								icon: <FileCode2 data-icon="inline-start" />,
								label: t("message.showOriginal"),
								onSelect: () => setSourceOpen(true),
							},
							{
								icon: <Mail data-icon="inline-start" />,
								label: message.read
									? t("common.markUnread")
									: t("common.markRead"),
								onSelect: () =>
									onMessageAction(message.read ? "unread" : "read"),
							},
							...moveActions.map((item) => ({
								icon: createElement(item.icon, { "data-icon": "inline-start" }),
								label: t(item.labelKey),
								onSelect: () => onMessageAction(item.action),
							})),
							...(message.direction === "inbound" && mailboxId
								? [
										{
											icon: <Ban data-icon="inline-start" />,
											label: t("message.blockContact"),
											onSelect: () => onBlock(),
										},
									]
								: []),
						]}
					/>
					<MessageSourceDialog
						messageId={message.id}
						open={sourceOpen}
						onOpenChange={setSourceOpen}
					/>
				</>
			)}
		</div>
	);
}
