"use client";

import Link from "next/link";
import { Mail, X } from "lucide-react";
import { getEmailDisplayName } from "@/lib/email/address";
import { useLanguage } from "@/components/language-provider";
import type { NewMessagePopupProps } from "./new-message-popup-types";

export function NewMessagePopup({
	notification,
	onDismiss,
}: NewMessagePopupProps) {
	const { t } = useLanguage();
	return (
		<div className="fixed right-5 top-5 z-[100] w-[min(380px,calc(100vw-40px))] rounded-xl bg-card p-4 shadow-xl">
			<div className="flex items-start gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
					<Mail className="h-5 w-5" />
				</div>
				<Link
					href={`/inbox/${notification.messageId}`}
					onClick={onDismiss}
					className="min-w-0 flex-1"
				>
					<p className="text-sm font-semibold text-foreground">
						{t("notification.newEmail")}
					</p>
					<p className="mt-0.5 truncate text-sm text-foreground">
						{notification.subject || t("list.noSubject")}
					</p>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{t("notification.from", { sender: notification.fromName ?? getEmailDisplayName(notification.from) })}
					</p>
				</Link>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground/80"
				>
					<X className="h-4 w-4" />
					<span className="sr-only">{t("notification.dismiss")}</span>
				</button>
			</div>
		</div>
	);
}
