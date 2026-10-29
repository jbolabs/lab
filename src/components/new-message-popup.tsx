"use client";

import { Button } from "@/components/ui/button";
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
		<div className="fixed right-5 top-[calc(1.25rem+env(safe-area-inset-top))] z-[100] w-[min(380px,calc(100vw-40px))] rounded-lg border bg-card p-4 shadow-md">
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
						{t("notification.from", {
							sender:
								notification.fromName ?? getEmailDisplayName(notification.from),
						})}
					</p>
				</Link>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					onClick={onDismiss}
					className="size-11 shrink-0"
				>
					<X />
					<span className="sr-only">{t("notification.dismiss")}</span>
				</Button>
			</div>
		</div>
	);
}
