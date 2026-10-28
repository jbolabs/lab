"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { DriveUploadEntry } from "./drive-upload-types";

// Every upload of the session stacked in one card: a row per file with its bar and percentage.
export function DriveUploadPanel({ uploads, onClose }: { uploads: DriveUploadEntry[]; onClose: () => void }) {
	const { t } = useLanguage();
	if (!uploads.length) return null;
	const active = uploads.filter((entry) => entry.status === "queued" || entry.status === "uploading").length;
	const done = uploads.filter((entry) => entry.status === "done").length;

	return (
		<section aria-label={t("drive.uploads")} className="fixed bottom-4 right-4 z-[90] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
			<header className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-2.5 text-sm font-medium text-foreground">
				<span aria-live="polite">{active ? t("drive.uploadingCount", { count: active }) : t("drive.uploaded", { count: done })}</span>
				<button type="button" onClick={onClose} disabled={active > 0} aria-label={t("navigation.close")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:invisible"><X size={16} /></button>
			</header>
			<ul className="max-h-64 divide-y divide-border overflow-y-auto">
				{uploads.map((entry) => (
					<li key={entry.id} className="px-4 py-2.5 text-sm">
						<div className="flex items-center gap-2">
							<span className="min-w-0 flex-1 truncate text-foreground" title={entry.name}>{entry.name}</span>
							{entry.status === "done" && <CheckCircle2 size={16} className="shrink-0 text-green-600" aria-label={t("drive.uploadDone")} />}
							{entry.status === "failed" && <AlertCircle size={16} className="shrink-0 text-red-600" aria-hidden="true" />}
						</div>
						{entry.status === "failed" ? <p className="mt-1 text-xs text-red-600">{entry.error ?? t("drive.uploadFailed", { name: entry.name })}</p> : (
							<div className="mt-1.5 flex items-center gap-3">
								<div role="progressbar" aria-label={entry.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.percent} className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-accent">
									<div className={clsx("h-full rounded-full transition-[width] duration-200", entry.status === "done" ? "bg-green-600" : "bg-primary")} style={{ width: `${entry.percent}%` }} />
								</div>
								<span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{entry.status === "queued" ? "—" : `${entry.percent}%`}</span>
							</div>
						)}
						{entry.resumed && entry.status === "uploading" && <p className="mt-1 text-xs text-muted-foreground">{t("drive.resuming", { name: entry.name })}</p>}
					</li>
				))}
			</ul>
		</section>
	);
}
