"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { authFetch } from "@/lib/auth/client";
import { formatUserDate } from "@/lib/time/utils";
import { htmlToPlainText } from "@/components/compose/rich-text-utils";
import type { SendReviewProps } from "./send-review-types";

export function SendReview({
	approvalId,
	snapshot,
	onClose,
	onSent,
}: SendReviewProps) {
	const { t } = useLanguage();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function confirm() {
		setBusy(true);
		setError(null);
		try {
			const response = await authFetch(
				`/api/agent/approvals/${approvalId}/confirm`,
				{ method: "POST" },
			);
			const result = (await response.json()) as {
				status?: string;
				messageId?: string;
				error?: string;
			};
			if (!response.ok || result.status !== "sent" || !result.messageId)
				throw new Error(result.error || t("agent.review.deliveryNeedsReview"));
			window.dispatchEvent(new Event("mailflare:messages-changed"));
			onSent?.(result.messageId);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : t("agent.review.couldNotSend"),
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose?.();
			}}
		>
			<DialogContent
				className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-2xl"
				aria-describedby="send-review-description"
			>
				<DialogHeader>
					<DialogTitle>
						{snapshot.scheduledAt
							? t("agent.review.reviewSchedule")
							: t("agent.review.reviewSend")}
					</DialogTitle>
					<DialogDescription id="send-review-description">
						{snapshot.scheduledAt
							? t("agent.review.confirmScheduled")
							: t("agent.review.confirmDelivered")}
					</DialogDescription>
				</DialogHeader>
				<dl className="mt-4 grid grid-cols-[5rem_1fr] gap-2 text-sm break-words">
					<dt className="text-muted-foreground">{t("agent.review.from")}</dt>
					<dd>{snapshot.from}</dd>
					<dt className="text-muted-foreground">{t("agent.review.to")}</dt>
					<dd>{snapshot.to}</dd>
					{snapshot.cc && (
						<>
							<dt className="text-muted-foreground">{t("agent.review.cc")}</dt>
							<dd>{snapshot.cc}</dd>
						</>
					)}
					{snapshot.bcc && (
						<>
							<dt className="text-muted-foreground">{t("agent.review.bcc")}</dt>
							<dd>{snapshot.bcc}</dd>
						</>
					)}
					<dt className="text-muted-foreground">{t("agent.review.subject")}</dt>
					<dd>{snapshot.subject}</dd>
					{snapshot.scheduledAt && (
						<>
							<dt className="text-muted-foreground">
								{t("agent.review.sendAt")}
							</dt>
							<dd>
								{formatUserDate(snapshot.scheduledAt, {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</dd>
						</>
					)}
				</dl>
				<pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">
					{snapshot.text || htmlToPlainText(snapshot.html || "")}
				</pre>
				{snapshot.attachments.length > 0 && (
					<p className="mt-3 text-sm">
						{t("agent.review.attachments", {
							list: snapshot.attachments
								.map((item) => item.filename)
								.join(", "),
						})}
					</p>
				)}
				{error && (
					<p role="alert" className="mt-3 text-sm text-destructive">
						{error}
					</p>
				)}
				<DialogFooter>
					{onClose && (
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={busy}
						>
							{t("common.cancel")}
						</Button>
					)}
					<Button type="button" onClick={() => void confirm()} disabled={busy}>
						{busy
							? snapshot.scheduledAt
								? t("agent.review.scheduling")
								: t("agent.review.sending")
							: snapshot.scheduledAt
								? t("agent.review.confirmSchedule")
								: t("agent.review.confirmSend")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
