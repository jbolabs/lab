"use client";

import { clsx } from "clsx";
import { ChevronsUpDown, Paperclip } from "lucide-react";
import { useState } from "react";

import {
	getMessageBodyDisplay,
	resolveInlineAttachmentUrls,
} from "@/app/(dashboard)/inbox/[messageId]/utils";
import { useLanguage } from "@/components/language-provider";
import { runSingleMessageAction } from "@/components/message-actions/utils";
import { MessageAvatar } from "@/components/messages/message-avatar";
import { QuotedEmailToggle } from "@/components/messages/quoted-email-toggle";
import { Button } from "@/components/ui/button";
import { Item } from "@/components/ui/item";
import { useMessageField } from "@/hooks/use-message-field";
import { formatUserDate } from "@/lib/time/utils";
import { cn } from "@/lib/utils";

import { useAssistantOpen } from "../agent/assistant-open-state";
import type {
	ConversationMessageCardProps,
	ConversationThreadProps,
} from "./conversation-thread-types";
import {
	getConversationRecipients,
	getConversationSender,
	getConversationSenderEmail,
	partitionThread,
} from "./conversation-thread-utils";
import { EmailHtmlRenderer } from "./email-html-renderer";
import { useMessageListVisibility } from "./message-list-visibility";
import { ThreadMessageActions } from "./thread-message-actions";
import { useRemoteContent } from "./use-remote-content";

function useConversationMessageCard({
	message,
	mailboxId,
	currentAccountName,
	ownAddress,
	ownAddresses,
	defaultExpanded = false,
	showFullRecipientAddresses = false,
}: ConversationMessageCardProps) {
	const { t } = useLanguage();
	const [locallyExpanded, setLocallyExpanded] = useState(defaultExpanded);
	const [locallyRead, setLocallyRead] = useMessageField(message.read);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const expanded = locallyExpanded;
	const sender = getConversationSender(message, currentAccountName);
	const senderEmail = getConversationSenderEmail(message);
	const remote = useRemoteContent(senderEmail, message.status === "spam");
	const recipients = getConversationRecipients(
		message,
		showFullRecipientAddresses ? "full" : "address"
	);
	// const href = `${getMessageBackHref(message.direction, message.status)}/${message.id}`;
	const outbound = message.direction === "outbound";
	const attachments = message.attachments.filter(
		(attachment) => attachment.disposition === "attachment"
	);
	const { visible: messageListVisible } = useMessageListVisibility();
	const isAssistantOpen = useAssistantOpen();
	const isAnyPanelVisible = messageListVisible || isAssistantOpen;

	let body: {
		html: string | null;
		text: string;
		quotedHtml: string | null;
	} | null = null;
	if (expanded) {
		const display = getMessageBodyDisplay(
			message.textBody,
			message.htmlBody,
			message.snippet
		);
		body = {
			html: resolveInlineAttachmentUrls(
				display.htmlBody,
				message.id,
				message.attachments
			),
			quotedHtml: resolveInlineAttachmentUrls(
				display.quotedHtml,
				message.id,
				message.attachments
			),
			text: display.latestContent,
		};
	}

	return {
		attachments,
		body,
		detailsOpen,
		expanded,
		isAnyPanelVisible,
		locallyExpanded,
		locallyRead,
		mailboxId,
		message,
		outbound,
		ownAddress,
		ownAddresses,
		recipients,
		remote,
		sender,
		senderEmail,
		setDetailsOpen,
		setLocallyExpanded,
		setLocallyRead,
		t,
	};
}

function ConversationMessageBody({
	model,
}: {
	model: ReturnType<typeof useConversationMessageCard>;
}) {
	const { expanded, remote, attachments, body, message } = model;
	if (!expanded || !body) {
		return null;
	}
	return (
		<div className="pt-2 pb-4 sm:pl-16">
			{body.html ? (
				<EmailHtmlRenderer
					html={body.html}
					autoAllowRemote={remote.autoAllow}
					onAllowRemote={() => remote.allowSender()}
				/>
			) : (
				<pre className="font-sans text-sm whitespace-pre-wrap text-foreground">
					{body.text}
				</pre>
			)}
			{body.quotedHtml && (
				<QuotedEmailToggle
					html={body.quotedHtml}
					autoAllowRemote={remote.autoAllow}
					onAllowRemote={() => remote.allowSender()}
				/>
			)}
			{attachments.length > 0 && (
				<ul className="mt-4 flex flex-wrap gap-2">
					{attachments.map((attachment) => (
						<li key={attachment.id}>
							<Item variant="outline" size="sm" asChild>
								<a
									href={`/api/messages/${message.id}/attachments/${attachment.id}`}
									className="min-h-11"
								>
									<Paperclip className="size-3" />
									<span className="max-w-48 truncate">
										{attachment.filename}
									</span>
								</a>
							</Item>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
export function ConversationMessageCard(props: ConversationMessageCardProps) {
	const model = useConversationMessageCard(props);
	const {
		t,
		locallyExpanded,
		setLocallyExpanded,
		locallyRead,
		setLocallyRead,
		detailsOpen,
		setDetailsOpen,
		expanded,
		sender,
		senderEmail,
		recipients,
		outbound,
		attachments,
		isAnyPanelVisible,
		message,
		mailboxId,
		ownAddress,
		ownAddresses,
	} = model;
	return (
		<article
			className={cn(
				"bg-card px-3 transition-colors sm:px-6",
				!expanded && "hover:bg-accent/60",
				!isAnyPanelVisible && "sm:pl-12"
			)}
		>
			<div className="w-full">
				<div className="flex w-full flex-wrap items-start gap-x-3 py-3 sm:pl-4">
					<Button
						type="button"
						variant="plain"
						size="none"
						onClick={() => {
							const shouldExpand = !locallyExpanded;
							setLocallyExpanded(shouldExpand);
							if (!shouldExpand || locallyRead) {
								return;
							}
							setLocallyRead(true);
							void runSingleMessageAction(message.id, "read").catch(() =>
								setLocallyRead(false)
							);
						}}
						aria-expanded={expanded}
						className="min-w-0 flex-1 basis-40 cursor-pointer justify-start text-left whitespace-normal active:not-disabled:scale-100"
					>
						<span className="flex min-w-0 flex-1 items-start gap-3">
							<MessageAvatar
								mailboxId={mailboxId}
								address={message.fromAddr}
								name={sender}
								hasManagedAvatar={message.fromContactHasAvatar}
								managedAvatarUrl={
									outbound && mailboxId
										? `/api/mailboxes/${mailboxId}/avatar`
										: undefined
								}
								className={expanded ? "mt-1" : ""}
							/>
							<span className="min-w-0 flex-1">
								<div className="flex flex-col">
									<span
										className={cn(
											"mt-1 truncate text-sm font-semibold",
											locallyRead || outbound
												? "text-foreground"
												: "font-semibold text-foreground"
										)}
									>
										{sender}
										{expanded && (
											<span className="ml-1 hidden text-xs opacity-50 sm:inline">
												&lt;{senderEmail}&gt;
											</span>
										)}
									</span>
									{expanded && recipients && (
										<span className="text-xs font-normal text-muted-foreground">
											{t("thread.to", { recipients })}
										</span>
									)}
								</div>
								{!expanded && (
									<span
										className={clsx(
											locallyRead ? "text-muted-foreground" : "font-semibold",
											"block truncate text-sm"
										)}
									>
										{message.snippet || t("thread.noPreview")}
									</span>
								)}
							</span>
						</span>
					</Button>
					<span
						className={clsx(
							locallyRead ? "" : "font-semibold",
							"mt-2 mr-2 shrink-0 items-center gap-2 text-xs",
							"hidden sm:flex"
						)}
					>
						{attachments.length > 0 && (
							<Paperclip
								className="size-3.5"
								aria-label={t("thread.attachmentCount", {
									count: attachments.length,
								})}
							/>
						)}
						{formatUserDate(message.createdAt, {
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
							month: "short",
							year: "numeric",
						})}
					</span>
					<ThreadMessageActions
						message={message}
						mailboxId={mailboxId}
						ownAddress={ownAddress}
						ownAddresses={ownAddresses}
						starOnly={!expanded}
					/>
					<div
						className={clsx(
							"flex w-full items-center gap-2 pl-12 text-xs sm:hidden",
							locallyRead
								? "text-muted-foreground"
								: "font-semibold text-foreground/80"
						)}
					>
						{attachments.length > 0 && (
							<Paperclip
								className="size-3.5"
								aria-label={t("thread.attachmentCount", {
									count: attachments.length,
								})}
							/>
						)}
						<span>
							{formatUserDate(message.createdAt, {
								day: "2-digit",
								month: "short",
								year: "numeric",
							})}
						</span>
						<Button
							variant="link"
							size="sm"
							type="button"
							aria-expanded={detailsOpen}
							onClick={() => setDetailsOpen((open) => !open)}
						>
							{t("message.details")}
						</Button>
					</div>
					{detailsOpen && (
						<dl className="flex w-full flex-col gap-0.5 pt-2 text-xs break-words text-muted-foreground sm:hidden">
							<div>
								<dt className="inline font-medium">{t("source.from")}:</dt>{" "}
								<dd className="inline">
									{sender} &lt;{senderEmail}&gt;
								</dd>
							</div>
							{recipients && (
								<div>
									<dt className="inline font-medium">{t("source.to")}:</dt>{" "}
									<dd className="inline">{recipients}</dd>
								</div>
							)}
							<div>
								<dt className="inline font-medium">{t("message.date")}:</dt>{" "}
								<dd className="inline">
									{formatUserDate(message.createdAt, {
										day: "2-digit",
										hour: "2-digit",
										minute: "2-digit",
										month: "short",
										year: "numeric",
									})}
								</dd>
							</div>
						</dl>
					)}
				</div>
				<ConversationMessageBody model={model} />
			</div>
		</article>
	);
}

/**
 * The other messages in a conversation, ordered oldest to newest and collapsed
 * until opened. Readers can also expand the full visible portion at once.
 */
export function ConversationThread({
	currentMessageId,
	position,
	messages,
	mailboxId,
	currentAccountName,
	ownAddress,
	ownAddresses,
	latestMessagesFirst,
	expandedAll,
	onExpandedAllChange,
	showFullRecipientAddresses = false,
}: ConversationThreadProps) {
	const { t } = useLanguage();
	const slice = partitionThread(
		messages,
		currentMessageId,
		position,
		latestMessagesFirst
	);
	if (slice.length === 0) {
		return null;
	}
	const [firstMessage] = slice;
	const lastMessage = slice.at(-1);
	if (!lastMessage) {
		return null;
	}
	const middleMessages = slice.slice(1, -1);
	const collapsed = !expandedAll && middleMessages.length > 0;
	const collapsedLabel = t(
		position === "before"
			? "thread.messagesCollapsed.older"
			: "thread.messagesCollapsed.newer",
		{ count: middleMessages.length }
	);

	return (
		<section
			aria-label={
				position === "before" ? t("thread.earlier") : t("thread.later")
			}
			className={cn(
				position === (latestMessagesFirst ? "before" : "after") ? "pb-6" : ""
			)}
		>
			<ol
				className={cn(
					!collapsed && "divide-y divide-border/50",
					latestMessagesFirst ? "border-t" : "border-b",
					"border-border"
				)}
			>
				<li className="border-t-0">
					<ConversationMessageCard
						message={firstMessage}
						mailboxId={mailboxId}
						currentAccountName={currentAccountName}
						ownAddress={ownAddress}
						ownAddresses={ownAddresses}
						showFullRecipientAddresses={showFullRecipientAddresses}
					/>
				</li>
				{collapsed ? (
					<li className="my-4 flex h-px items-center justify-center gap-1 border-y border-border py-2 text-center">
						<span className="flex flex-row items-center gap-2 bg-card px-6">
							<span className="text-sm font-medium text-muted-foreground">
								{collapsedLabel}
							</span>
							<Button
								variant="ghost"
								size="icon"
								type="button"
								onClick={() => onExpandedAllChange(true)}
								aria-label={t("thread.expand", { label: collapsedLabel })}
								title={t("thread.expand", { label: collapsedLabel })}
							>
								<ChevronsUpDown className="size-4" />
							</Button>
						</span>
					</li>
				) : (
					middleMessages.map((message) => (
						<li key={message.id}>
							<ConversationMessageCard
								message={message}
								mailboxId={mailboxId}
								currentAccountName={currentAccountName}
								ownAddress={ownAddress}
								ownAddresses={ownAddresses}
								showFullRecipientAddresses={showFullRecipientAddresses}
							/>
						</li>
					))
				)}
				{lastMessage.id !== firstMessage.id && (
					<li>
						<ConversationMessageCard
							message={lastMessage}
							mailboxId={mailboxId}
							currentAccountName={currentAccountName}
							ownAddress={ownAddress}
							ownAddresses={ownAddresses}
							showFullRecipientAddresses={showFullRecipientAddresses}
						/>
					</li>
				)}
			</ol>
		</section>
	);
}
