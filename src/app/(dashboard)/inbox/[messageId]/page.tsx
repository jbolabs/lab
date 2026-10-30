"use client";

import { clsx } from "clsx";
import { Cloud, ExternalLink, MailX } from "lucide-react";
import { useEffect, useState } from "react";

import { useAssistantOpen } from "@/components/agent/assistant-open-state";
import { ContactDetailsTrigger } from "@/components/contacts/contact-details";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { MarkAsRead } from "@/components/mark-read";
import { MessageActions } from "@/components/message-actions/message-actions";
import { MessageAttachmentViewer } from "@/components/message-attachment-viewer";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { EmailHtmlRenderer } from "@/components/messages/email-html-renderer";
import { MessageAttachmentItem } from "@/components/messages/message-attachment-item";
import { MessageAvatar } from "@/components/messages/message-avatar";
import {
	MessageDetailNavigation,
	useMessageSwipeNavigation,
} from "@/components/messages/message-detail-navigation";
import { useMessageListVisibility } from "@/components/messages/message-list-visibility";
import { MessageReadingHeaderButton } from "@/components/messages/message-reading-header-button";
import { QuotedEmailToggle } from "@/components/messages/quoted-email-toggle";
import { RecipientList } from "@/components/messages/recipient-list";
import { ScheduledSendBanner } from "@/components/messages/scheduled-send-banner";
import { formatScheduledSendTime } from "@/components/messages/scheduled-send-utils";
import { ThreadMessageActions } from "@/components/messages/thread-message-actions";
import { useLatestMessagesFirst } from "@/components/messages/use-latest-messages-first";
import { useMessageThread } from "@/components/messages/use-message-thread";
import { useRemoteContent } from "@/components/messages/use-remote-content";
import { useShowFullRecipientAddresses } from "@/components/messages/use-show-full-recipient-addresses";
import { usePageLoading } from "@/components/page-loading";
import { MessageDetailSkeleton } from "@/components/page-skeletons";
import { PreviousMessage } from "@/components/previous-message";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Item,
	ItemContent,
	ItemTitle,
	ItemDescription,
	ItemMedia,
} from "@/components/ui/item";
import { splitEmailAddressList, getEmailAddress } from "@/lib/email/address";
import { useParams } from "@/lib/navigation";
import { formatUserDate } from "@/lib/time/utils";

import { extractCloudAttachments } from "./cloud-attachment-utils";
import type {
	LoadedMessageData,
	MessageAttachment,
	MessageDetailResponse,
} from "./types";
import { useMessageContentScroll } from "./use-message-content-scroll";
import {
	fetchMessageDetail,
	fetchMessageMetadata,
	getCachedMessageDetailForDisplay,
	getMessageBodyDisplay,
	getMessageHeaderParties,
	getOwnAddressForMessage,
	resolveInlineAttachmentUrls,
} from "./utils";

function useLoadedMessageDetail(messageId: string, data: LoadedMessageData) {
	const { t } = useLanguage();
	const { selectedMailbox, mailboxes } = useSelectedMailbox();
	const [previewAttachment, setPreviewAttachment] =
		useState<MessageAttachment | null>(null);
	const [threadExpanded, setThreadExpanded] = useState(false);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [latestMessagesFirst] = useLatestMessagesFirst();
	const { enabled: showFullRecipientAddresses } =
		useShowFullRecipientAddresses();
	const remote = useRemoteContent(
		getEmailAddress(data.message.fromAddr),
		data.message.status === "spam"
	);
	const { visible: messageListVisible } = useMessageListVisibility();

	const thread = useMessageThread(messageId, data.message.threadId);
	const assistantVisible = useAssistantOpen();
	const isAnyPanelVisible = messageListVisible || assistantVisible;
	const { scrollRef, scrolled, handleScroll } = useMessageContentScroll();
	useMessageSwipeNavigation(scrollRef, messageId, true);

	const { message, body, attachments = [], scheduledAt } = data;
	const currentThreadMessage = {
		...message,
		attachments,
		htmlBody: body?.htmlBody ?? null,
		textBody: body?.textBody ?? null,
	};
	const messageMailbox =
		mailboxes.find((mailbox) => mailbox.id === message.mailboxId) ??
		selectedMailbox;
	const currentAccountName =
		messageMailbox?.displayName ?? messageMailbox?.localPart;
	const { fromName, fromAddress } = getMessageHeaderParties(
		message,
		currentAccountName
	);
	const getOwnAddresses = () => {
		if (messageMailbox) {
			return messageMailbox.senderAddresses?.length
				? messageMailbox.senderAddresses
				: [`${messageMailbox.localPart}@${messageMailbox.hostname}`];
		}
		return [];
	};
	const ownAddresses = getOwnAddresses();
	const ownAddress = getOwnAddressForMessage(message, ownAddresses);
	const toEntries = splitEmailAddressList(message.toAddr);
	const ccEntries = splitEmailAddressList(message.ccAddr);
	const bccEntries = splitEmailAddressList(message.bccAddr);
	const bodyDisplay = getMessageBodyDisplay(
		body?.textBody,
		body?.htmlBody,
		message.snippet,
		ownAddress
	);
	const htmlBody = resolveInlineAttachmentUrls(
		bodyDisplay.htmlBody,
		message.id,
		attachments
	);
	const quotedHtml = resolveInlineAttachmentUrls(
		bodyDisplay.quotedHtml,
		message.id,
		attachments
	);
	const cloudAttachmentResult = extractCloudAttachments(
		bodyDisplay.latestContent
	);
	const messageDate = (withTime: boolean) =>
		scheduledAt
			? formatScheduledSendTime(scheduledAt, t)
			: formatUserDate(
					message.createdAt,
					withTime
						? {
								day: "2-digit",
								hour: "2-digit",
								minute: "2-digit",
								month: "short",
								year: "numeric",
							}
						: { day: "2-digit", month: "short", year: "numeric" }
				);
	return {
		assistantVisible,
		attachments,
		bccEntries,
		body,
		bodyDisplay,
		ccEntries,
		cloudAttachmentResult,
		currentAccountName,
		currentThreadMessage,
		data,
		detailsOpen,
		fromAddress,
		fromName,
		handleScroll,
		htmlBody,
		isAnyPanelVisible,
		latestMessagesFirst,
		message,
		messageDate,
		messageId,
		ownAddress,
		ownAddresses,
		previewAttachment,
		quotedHtml,
		remote,
		scheduledAt,
		scrollRef,
		scrolled,
		setDetailsOpen,
		setPreviewAttachment,
		setThreadExpanded,
		showFullRecipientAddresses,
		t,
		thread,
		threadExpanded,
		toEntries,
	};
}

function MessageSenderHeader({
	model,
}: {
	model: ReturnType<typeof useLoadedMessageDetail>;
}) {
	const {
		t,
		detailsOpen,
		setDetailsOpen,
		showFullRecipientAddresses,
		thread,
		message,
		currentThreadMessage,
		fromName,
		fromAddress,
		ownAddresses,
		ownAddress,
		toEntries,
		ccEntries,
		bccEntries,
		messageDate,
	} = model;
	return (
		<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pb-5 sm:px-0 sm:pl-4">
			<div className="flex min-w-0 items-start gap-3">
				<MessageAvatar
					mailboxId={message.mailboxId}
					address={message.fromAddr}
					name={fromName}
					hasManagedAvatar={message.direction === "inbound"}
					managedAvatarUrl={
						message.direction === "outbound" && message.mailboxId
							? `/api/mailboxes/${message.mailboxId}/avatar`
							: undefined
					}
					className="mt-2"
				/>
				<div className="min-w-0 flex-1">
					<p className="mt-1.25 flex w-full flex-row items-center gap-1 overflow-hidden text-sm text-foreground">
						<b className="whitespace-nowrap">
							{message.direction === "inbound" ? (
								<ContactDetailsTrigger
									mailboxId={message.mailboxId}
									address={message.fromAddr}
									name={fromName}
								/>
							) : (
								fromName
							)}
						</b>{" "}
						<span className="hidden min-w-0 flex-1 overflow-hidden text-xs text-ellipsis text-muted-foreground sm:block">
							&lt;{fromAddress}&gt;
						</span>
					</p>
					<p className="text-xs text-muted-foreground">
						{t("source.to").toLowerCase()}{" "}
						<RecipientList
							entries={toEntries}
							mailboxId={message.mailboxId}
							addressStyle={showFullRecipientAddresses ? "full" : "address"}
						/>
					</p>
					<div className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
						<span>{messageDate(false)}</span>
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
					{ccEntries.length > 0 && (
						<p className="text-xs text-muted-foreground">
							{t("message.cc")}{" "}
							<RecipientList
								entries={ccEntries}
								mailboxId={message.mailboxId}
								addressStyle={showFullRecipientAddresses ? "full" : "address"}
							/>
						</p>
					)}
					{bccEntries.length > 0 && (
						<p className="text-xs text-muted-foreground">
							{t("message.bcc")}{" "}
							<RecipientList
								entries={bccEntries}
								mailboxId={message.mailboxId}
								addressStyle={showFullRecipientAddresses ? "full" : "address"}
							/>
						</p>
					)}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<p className="hidden text-xs sm:block">{messageDate(true)}</p>
				<ThreadMessageActions
					message={currentThreadMessage}
					mailboxId={message.mailboxId}
					ownAddress={ownAddress}
					ownAddresses={ownAddresses}
					starOnly={
						!thread.messages.some(
							(threadMessage) => threadMessage.id === message.id
						) ||
						!thread.messages.some(
							(threadMessage) => threadMessage.id !== message.id
						)
					}
				/>
			</div>
			{detailsOpen && (
				<dl className="flex w-full flex-col gap-0.5 pt-2 text-xs break-words text-muted-foreground sm:hidden">
					<div>
						<dt className="inline font-medium">{t("source.from")}:</dt>{" "}
						<dd className="inline">
							{fromName} &lt;{fromAddress}&gt;
						</dd>
					</div>
					<div>
						<dt className="inline font-medium">{t("source.to")}:</dt>{" "}
						<dd className="inline">{toEntries.join(", ")}</dd>
					</div>
					<div>
						<dt className="inline font-medium">{t("message.date")}:</dt>{" "}
						<dd className="inline">{messageDate(true)}</dd>
					</div>
				</dl>
			)}
		</div>
	);
}

function MessageBody({
	model,
}: {
	model: ReturnType<typeof useLoadedMessageDetail>;
}) {
	const {
		t,
		setPreviewAttachment,
		remote,
		isAnyPanelVisible,
		message,
		attachments,
		scheduledAt,
		bodyDisplay,
		htmlBody,
		quotedHtml,
		cloudAttachmentResult,
	} = model;
	return (
		<article className={clsx("py-4 sm:px-6", !isAnyPanelVisible && "sm:pl-12")}>
			<div className="w-full">
				<MessageSenderHeader model={model} />
				{scheduledAt && (
					<div className="px-4 sm:px-0 sm:pl-10">
						<ScheduledSendBanner
							messageId={message.id}
							scheduledAt={scheduledAt}
						/>
					</div>
				)}
				<div className="max-w-none px-4 text-foreground sm:px-0 sm:pl-16">
					{htmlBody ? (
						<EmailHtmlRenderer
							key={message.id}
							className="mx-auto"
							html={htmlBody}
							autoAllowRemote={remote.autoAllow}
							onAllowRemote={() => remote.allowSender()}
						/>
					) : (
						<pre className="mx-auto text-sm whitespace-pre-wrap">
							{cloudAttachmentResult.content}
						</pre>
					)}
					{quotedHtml && (
						<QuotedEmailToggle
							html={quotedHtml}
							autoAllowRemote={remote.autoAllow}
							onAllowRemote={() => remote.allowSender()}
						/>
					)}
					{bodyDisplay.quotedContent.map((quotedContent) => (
						<PreviousMessage
							key={`${quotedContent.dateLine}-${quotedContent.content.slice(0, 24)}`}
							message={quotedContent}
						/>
					))}
				</div>
				{cloudAttachmentResult.attachments.length > 0 && (
					<section className="mt-8 border-t border-border px-4 py-6 sm:px-0 sm:pl-16">
						<h2 className="mb-3 text-sm font-semibold text-foreground">
							{t("message.cloudFiles", {
								count: cloudAttachmentResult.attachments.length,
							})}
						</h2>
						<div className="grid gap-2 sm:grid-cols-2">
							{cloudAttachmentResult.attachments.map((attachment) => (
								<Item
									key={attachment.id}
									variant="outline"
									size="sm"
									render={
										// oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI render: the text is this component's children.
										<a href={attachment.url} target="_blank" rel="noreferrer" />
									}
								>
									<ItemMedia variant="icon">
										<Cloud />
									</ItemMedia>
									<ItemContent className="min-w-0">
										<ItemTitle className="max-w-full">
											<span className="truncate">{attachment.filename}</span>
										</ItemTitle>
										<ItemDescription>
											{t("message.openFrom", {
												provider: attachment.provider,
											})}
										</ItemDescription>
									</ItemContent>
									<ExternalLink
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<span className="sr-only">({t("common.opensInNewTab")})</span>
								</Item>
							))}
						</div>
					</section>
				)}
				{attachments.length > 0 && (
					<section className="mt-8 border-t border-border px-4 py-6 sm:px-0 sm:pl-16">
						<h2 className="mb-3 text-sm font-semibold text-foreground">
							{t("message.attachments", { count: attachments.length })}
						</h2>
						<div className="grid gap-2 sm:grid-cols-2">
							{attachments.map((attachment) => (
								<MessageAttachmentItem
									key={attachment.id}
									attachment={attachment}
									messageId={message.id}
									onPreview={setPreviewAttachment}
								/>
							))}
						</div>
					</section>
				)}
			</div>
		</article>
	);
}

function LoadedMessageDetail({
	messageId,
	data,
}: {
	messageId: string;
	data: LoadedMessageData;
}) {
	const model = useLoadedMessageDetail(messageId, data);
	const {
		t,
		previewAttachment,
		setPreviewAttachment,
		threadExpanded,
		setThreadExpanded,
		latestMessagesFirst,
		showFullRecipientAddresses,
		thread,
		assistantVisible,
		isAnyPanelVisible,
		scrollRef,
		scrolled,
		handleScroll,
		message,
		body,
		currentAccountName,
		ownAddresses,
		ownAddress,
	} = model;
	return (
		<>
			<div
				className={clsx(
					"sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-1 border-b bg-card px-2 pt-safe",
					scrolled ? "border-border" : "border-transparent"
				)}
			>
				<MessageReadingHeaderButton assistantVisible={assistantVisible} />
				{/* <div className="min-w-0 flex-1" /> */}
				{/* <div className="flex items-center flex-row gap-6">
					<Link
						href={getMessageBackHref(message.direction, message.status)}
						className="rounded-full p-2 text-muted-foreground hover:bg-accent"
					>
						<ArrowLeft className="size-5" />
					</Link>
				</div> */}
				<MessageActions
					messageId={message.id}
					mailboxId={message.mailboxId}
					senderAddress={message.fromAddr}
					direction={message.direction}
					status={message.status}
					read={message.read}
					unsubscribeUrl={data.unsubscribeUrl}
					subject={message.subject}
					bodyText={body?.textBody}
					ownAddress={ownAddress}
					ownAddresses={ownAddresses}
					message={message}
					messageMeta={message}
					bodyHtml={body?.htmlBody}
				/>
				<MessageDetailNavigation
					messageId={message.id}
					unread={message.direction === "inbound" && !message.read}
				/>
			</div>

			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="h-full min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain pb-safe-add-20 md:pb-6"
			>
				{!message.read && <MarkAsRead messageId={message.id} />}

				<h1
					className={clsx(
						isAnyPanelVisible ? "sm:pl-10" : "sm:pl-16",
						"px-4 pt-6 pb-2 text-2xl font-medium tracking-tight text-foreground sm:pr-6"
					)}
					title={message.subject ?? t("list.noSubject")}
				>
					{message.subject ?? t("list.noSubject")}
				</h1>
				{/* <div className="px-6">
        <div className="mx-auto w-full max-w-[640px]">
          <SpamScoreDetails
            score={message.spamScore}
            verdict={message.spamVerdict}
            signals={message.spamSignals}
            analysisError={message.spamAnalysisError}
          />
        </div>
      </div> */}
				<ConversationThread
					currentMessageId={message.id}
					position={latestMessagesFirst ? "after" : "before"}
					messages={thread.messages}
					mailboxId={message.mailboxId}
					currentAccountName={currentAccountName}
					ownAddress={ownAddress}
					ownAddresses={ownAddresses}
					latestMessagesFirst={latestMessagesFirst}
					showFullRecipientAddresses={showFullRecipientAddresses}
					expandedAll={threadExpanded}
					onExpandedAllChange={setThreadExpanded}
				/>
				<MessageBody model={model} />
				<ConversationThread
					currentMessageId={message.id}
					position={latestMessagesFirst ? "before" : "after"}
					messages={thread.messages}
					mailboxId={message.mailboxId}
					currentAccountName={currentAccountName}
					ownAddress={ownAddress}
					ownAddresses={ownAddresses}
					latestMessagesFirst={latestMessagesFirst}
					showFullRecipientAddresses={showFullRecipientAddresses}
					expandedAll={threadExpanded}
					onExpandedAllChange={setThreadExpanded}
				/>
				<MessageAttachmentViewer
					attachment={previewAttachment}
					messageId={message.id}
					open={previewAttachment !== null}
					onOpenChange={(open) => {
						if (!open) {
							setPreviewAttachment(null);
						}
					}}
				/>
			</div>
		</>
	);
}

function MessageDetailContent({ messageId }: { messageId: string }) {
	const { t } = useLanguage();
	const [data, setData] = useState<MessageDetailResponse | null>(null);
	const [loading, setLoading] = useState(true);
	usePageLoading(loading);

	useEffect(() => {
		let cancelled = false;

		async function loadMessage() {
			const cachedData = getCachedMessageDetailForDisplay(messageId);
			if (cachedData?.message && cachedData.body) {
				setData(cachedData);
				setLoading(false);
				if (cachedData.attachments !== undefined) {
					return;
				}
				try {
					const metadata = await fetchMessageMetadata(messageId);
					if (!cancelled) {
						setData((current) =>
							current ? { ...current, ...metadata } : current
						);
					}
				} catch {
					// The message body remains usable if supplemental metadata is unavailable.
				}
				return;
			}
			setLoading(true);
			const nextData = await fetchMessageDetail(messageId);
			if (!cancelled) {
				setData(nextData);
				setLoading(false);
			}
		}

		void loadMessage();
		return () => {
			cancelled = true;
		};
	}, [messageId]);

	if (loading) {
		return <MessageDetailSkeleton />;
	}

	if (!data?.message) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MailX />
					</EmptyMedia>
					<EmptyTitle>{data?.error ?? t("message.notFound")}</EmptyTitle>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<LoadedMessageDetail
			messageId={messageId}
			data={data as LoadedMessageData}
		/>
	);
}

export default function MessageDetailPage() {
	const { messageId } = useParams<{ messageId: string }>();
	return <MessageDetailContent key={messageId} messageId={messageId} />;
}
