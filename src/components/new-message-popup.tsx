"use client";

import { Mail, X } from "lucide-react";
import Link from "next/link";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { getEmailDisplayName } from "@/lib/email/address";

import type { NewMessagePopupProps } from "./new-message-popup-types";

export function NewMessagePopup({
	notification,
	onDismiss,
}: NewMessagePopupProps) {
	const { t } = useLanguage();
	return (
		<div className="fixed top-safe-add-5 right-5 z-[100] w-[min(380px,calc(100vw-40px))] rounded-lg border bg-card p-4 shadow-md">
			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
					<Mail className="size-5" />
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
					className="shrink-0"
				>
					<X />
					<span className="sr-only">{t("notification.dismiss")}</span>
				</Button>
			</div>
		</div>
	);
}
