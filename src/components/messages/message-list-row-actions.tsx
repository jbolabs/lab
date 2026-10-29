"use client";

import { Archive, Clock, Mail, MailOpen, Trash2 } from "lucide-react";
import { useState } from "react";

import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { MessageSnoozeDialog } from "@/components/message-actions/message-snooze-dialog";
import { Button } from "@/components/ui/button";

import {
	isMessageSnoozed,
	unsnoozeMessage,
} from "./message-list-row-actions-utils";
import type { MessageListRowActionsProps } from "./types";

export function MessageListRowActions({
	message,
	onAction,
}: MessageListRowActionsProps) {
	const { t } = useLanguage();
	const [snoozeOpen, setSnoozeOpen] = useState(false);
	const snoozed = isMessageSnoozed(message.snoozedUntil);
	const readAction = message.read ? "unread" : "read";

	return (
		<>
			<div className="pointer-events-none absolute top-1/2 right-6 z-10 hidden -translate-y-1/2 items-center gap-1 bg-card pl-3 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:flex">
				<HintTooltip label={t("common.archive")}>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => onAction("archive")}
						aria-label={t("common.archive")}
					>
						<Archive data-icon="inline-start" />
					</Button>
				</HintTooltip>
				<HintTooltip label={t("common.trash")}>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => onAction("trash")}
						aria-label={t("common.trash")}
					>
						<Trash2 data-icon="inline-start" />
					</Button>
				</HintTooltip>
				<HintTooltip
					label={
						readAction === "read"
							? t("common.markRead")
							: t("common.markUnread")
					}
				>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => onAction(readAction)}
						aria-label={
							readAction === "read"
								? t("common.markRead")
								: t("common.markUnread")
						}
					>
						{readAction === "read" ? (
							<MailOpen data-icon="inline-start" />
						) : (
							<Mail data-icon="inline-start" />
						)}
					</Button>
				</HintTooltip>
				<HintTooltip
					label={snoozed ? t("common.unsnooze") : t("common.snooze")}
				>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => {
							if (snoozed) {
								void unsnoozeMessage(message.id);
								return;
							}
							setSnoozeOpen(true);
						}}
						aria-label={snoozed ? t("common.unsnooze") : t("common.snooze")}
					>
						<Clock data-icon="inline-start" />
					</Button>
				</HintTooltip>
			</div>

			<MessageSnoozeDialog
				messageId={message.id}
				open={snoozeOpen}
				onOpenChange={setSnoozeOpen}
			/>
		</>
	);
}
