"use client";

import { CheckCircle2, Copy, Download, LoaderCircle } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import type { MessageSourceDialogProps } from "./message-source-dialog-types";
import {
	copyMessageSource,
	downloadMessageSource,
	fetchMessageSource,
	summarizeMessageSource,
} from "./message-source-utils";

export function MessageSourceDialog({
	messageId,
	open,
	onOpenChange,
}: MessageSourceDialogProps) {
	const { t } = useLanguage();
	const translateEffect = useEffectEvent(t);
	const [source, setSource] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(open);
	const identity = `${messageId}:${open}`;
	const [previousIdentity, setPreviousIdentity] = useState(identity);

	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState(false);
	if (previousIdentity !== identity) {
		setPreviousIdentity(identity);
		setSource(null);
		setError(null);
		setCopied(false);
		setCopyError(false);
		setLoading(open);
	}
	const summary = useMemo(
		() => (source === null ? null : summarizeMessageSource(source)),
		[source]
	);

	useEffect(() => {
		if (!open) {
			return;
		}
		const controller = new AbortController();
		void fetchMessageSource(messageId, controller.signal)
			.then((value) => {
				if (!controller.signal.aborted) {
					setSource(value);
				}

				return null;
			})
			.catch((error_) => {
				if (!controller.signal.aborted) {
					setError(
						error_ instanceof Error
							? error_.message
							: translateEffect("source.loadFailed")
					);
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			});
		return () => controller.abort();
	}, [messageId, open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] w-[min(960px,calc(100vw-32px))] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{t("source.title")}</DialogTitle>
					<DialogDescription>{t("source.description")}</DialogDescription>
				</DialogHeader>
				{loading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<LoaderCircle className="size-4 animate-spin" />
						{t("source.loading")}
					</div>
				)}
				{error && <p className="text-sm text-muted-foreground">{error}</p>}
				{source !== null && summary && (
					<div className="flex flex-col gap-5">
						<div className="overflow-hidden rounded-lg border border-border text-sm">
							{(
								[
									["messageId", summary.messageId],
									["createdAt", summary.createdAt],
									["from", summary.from],
									["to", summary.to],
									["subject", summary.subject],
								] as const
							).map(([label, value]) => (
								<div
									key={label}
									className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"
								>
									<span className="font-medium text-foreground/80">
										{t(`source.${label}`)}
									</span>
									<span
										className={
											label === "messageId" && value
												? "break-all text-success"
												: "break-words text-foreground"
										}
									>
										{value || t("source.unavailable")}
									</span>
								</div>
							))}
							{(["spf", "dkim", "dmarc"] as const).map((method) => {
								const result = summary[method];
								return (
									<div
										key={method}
										className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"
									>
										<span className="font-medium text-foreground/80 uppercase">
											{method}
										</span>
										<span className="flex min-w-0 items-center gap-1.5 break-all text-foreground">
											{result?.status === "PASS" && (
												<CheckCircle2
													className="size-4 shrink-0 text-success"
													aria-label={t("source.passed", {
														method: method.toUpperCase(),
													})}
												/>
											)}
											{result
												? `${result.status}${result.detail ? ` ${result.detail}` : ""}`
												: t("source.noResult")}
										</span>
									</div>
								);
							})}
						</div>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => downloadMessageSource(source, messageId)}
							>
								<Download data-icon="inline-start" />
								{t("source.download")}
							</Button>
							<div className="flex items-center gap-2">
								{copyError && (
									<span role="alert" className="text-xs text-destructive">
										{t("source.couldNotCopy")}
									</span>
								)}
								<Button
									type="button"
									size="sm"
									onClick={() => {
										void copyMessageSource(source)
											.then(() => {
												setCopied(true);
												setCopyError(false);

												return null;
											})
											.catch(() => {
												setCopied(false);
												setCopyError(true);
											});
									}}
								>
									<Copy data-icon="inline-start" />
									{copied ? t("source.copied") : t("source.copy")}
								</Button>
							</div>
						</div>
						<pre className="max-h-[40dvh] overflow-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-xs leading-relaxed whitespace-pre text-foreground/80">
							{source}
						</pre>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
