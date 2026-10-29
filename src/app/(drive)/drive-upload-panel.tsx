"use client";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn as scopeLayoutClasses } from "@/lib/utils";

import type { DriveUploadEntry } from "./drive-upload-types";

// Every upload of the session stacked in one card: a row per file with its bar and percentage.
export function DriveUploadPanel({
	uploads,
	onClose,
}: {
	uploads: DriveUploadEntry[];
	onClose: () => void;
}) {
	const { t } = useLanguage();
	if (!uploads.length) {
		return null;
	}
	const active = uploads.filter(
		(entry) => entry.status === "queued" || entry.status === "uploading"
	).length;
	const done = uploads.filter((entry) => entry.status === "done").length;

	return (
		<section
			aria-label={t("drive.uploads")}
			className={scopeLayoutClasses(
				"fixed right-4 bottom-4 overflow-hidden rounded-lg border bg-card shadow-sm",
				"z-90",
				"w-[min(360px,calc(100vw_-_2rem))]"
			)}
		>
			<header className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-2.5 text-sm font-medium text-foreground">
				<span aria-live="polite">
					{active
						? t("drive.uploadingCount", { count: active })
						: t("drive.uploaded", { count: done })}
				</span>
				<Button
					variant="ghost"
					type="button"
					onClick={onClose}
					disabled={active > 0}
					aria-label={t("navigation.close")}
					size="icon-sm"
					className="disabled:invisible"
				>
					<X data-icon="inline-start" />
				</Button>
			</header>
			<ul className="max-h-64 divide-y overflow-y-auto">
				{uploads.map((entry) => (
					<li key={entry.id} className="px-4 py-2.5 text-sm">
						<div className="flex items-center gap-2">
							<span
								className="min-w-0 flex-1 truncate text-foreground"
								title={entry.name}
							>
								{entry.name}
							</span>
							{entry.status === "done" && (
								<CheckCircle2
									size={16}
									className="shrink-0 text-success"
									aria-label={t("drive.uploadDone")}
								/>
							)}
							{entry.status === "failed" && (
								<AlertCircle
									size={16}
									className="shrink-0 text-destructive"
									aria-hidden="true"
								/>
							)}
						</div>
						{entry.status === "failed" ? (
							<p className="mt-1 text-xs text-destructive">
								{entry.error ?? t("drive.uploadFailed", { name: entry.name })}
							</p>
						) : (
							<div className="mt-1.5 flex items-center gap-3">
								<Progress
									value={entry.percent}
									aria-label={entry.name}
									variant={entry.status === "done" ? "success" : "default"}
									className="h-1.5 min-w-0 flex-1"
								/>
								<span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
									{entry.status === "queued" ? "—" : `${entry.percent}%`}
								</span>
							</div>
						)}
						{entry.resumed && entry.status === "uploading" && (
							<p className="mt-1 text-xs text-muted-foreground">
								{t("drive.resuming", { name: entry.name })}
							</p>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
