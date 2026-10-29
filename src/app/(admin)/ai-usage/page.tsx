"use client";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import type { AiUsageResponse } from "./types";
import { fetchAiUsage, formatEstimatedUsd, formatTokenCount, formatUsageDate, formatUsageProvider } from "./utils";
import { UsageChart } from "./usage-chart";

export default function AiUsagePage() {
	const { t } = useLanguage();
	const [data, setData] = useState<AiUsageResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loadingPage, setLoadingPage] = useState(false);

	useEffect(() => {
		let active = true;
		void fetchAiUsage(1).then((result) => { if (active) setData(result); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t("aiUsage.loadFailed")); });
		return () => { active = false; };
	}, [t]);

	const totals = data?.totals;
	return <div className="flex flex-col gap-6">
		<div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("aiUsage.title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("aiUsage.description")}</p></div><Link href="/agent" className="shrink-0 text-sm font-medium text-signal hover:underline">{t("aiUsage.back")}</Link></div>
		{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
		<div className="grid gap-4 sm:grid-cols-3">
			<section className="rounded-lg bg-card p-5"><p className="text-sm text-muted-foreground">{t("aiUsage.totalTokens")}</p><p className="mt-2 text-2xl font-semibold text-foreground">{totals ? formatTokenCount(totals.totalTokens) : "—"}</p></section>
			<section className="rounded-lg bg-card p-5"><p className="text-sm text-muted-foreground">{t("aiUsage.totalRequests")}</p><p className="mt-2 text-2xl font-semibold text-foreground">{totals ? formatTokenCount(totals.requests) : "—"}</p></section>
			<section className="rounded-lg bg-card p-5"><p className="text-sm text-muted-foreground">{t("aiUsage.spend")}</p><p className="mt-2 text-2xl font-semibold text-foreground">{totals && totals.pricedRequests ? formatEstimatedUsd(totals.costUsdMicros) : "—"}</p>{totals && totals.pricedRequests < totals.requests && <p className="mt-1 text-xs text-muted-foreground">{t("aiUsage.noRate", { count: formatTokenCount(totals.requests - totals.pricedRequests) })}</p>}</section>
		</div>
		<UsageChart daily={data?.daily ?? []} timeZone={data?.timeZone} />
		<section role="region" tabIndex={0} aria-label={t("aiUsage.title")} className="overflow-x-auto rounded-lg bg-card" aria-busy={loadingPage}><Table className="w-full min-w-[850px] text-left text-sm"><TableHeader className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><TableRow><TableHead scope="col" className="px-4 py-3">{t("aiUsage.col.dateTime")}</TableHead><TableHead scope="col" className="px-4 py-3">{t("aiUsage.col.model")}</TableHead><TableHead scope="col" className="px-4 py-3">{t("aiUsage.col.provider")}</TableHead><TableHead scope="col" className="px-4 py-3 text-right">{t("aiUsage.col.input")}</TableHead><TableHead scope="col" className="px-4 py-3 text-right">{t("aiUsage.col.output")}</TableHead><TableHead scope="col" className="px-4 py-3 text-right">{t("aiUsage.col.spending")}</TableHead></TableRow></TableHeader><TableBody className="divide-y divide-border">{data?.rows.map((row) => <TableRow key={row.id}><TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatUsageDate(row.createdAt)}</TableCell><TableCell className="max-w-56 break-all px-4 py-3">{row.model}</TableCell><TableCell className="px-4 py-3">{formatUsageProvider(row.provider)}</TableCell><TableCell className="px-4 py-3 text-right tabular-nums">{formatTokenCount(row.inputTokens)}</TableCell><TableCell className="px-4 py-3 text-right tabular-nums">{formatTokenCount(row.outputTokens)}</TableCell><TableCell className="px-4 py-3 text-right tabular-nums">{formatEstimatedUsd(row.costUsdMicros)}</TableCell></TableRow>)}{data && data.rows.length === 0 && <TableRow><TableCell colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t("aiUsage.none")}</TableCell></TableRow>}{!data && !error && <TableRow><TableCell colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t("aiUsage.loading")}</TableCell></TableRow>}</TableBody></Table></section>
		{data && <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground"><span>{t("aiUsage.pageOf", { page: data.page, total: data.totalPages, size: data.pageSize })}</span><Button type="button" variant="outline" size="sm" disabled={loadingPage || data.page <= 1} onClick={() => { setLoadingPage(true); setError(null); void fetchAiUsage(data.page - 1).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : t("aiUsage.pageFailed"))).finally(() => setLoadingPage(false)); }}>{t("aiUsage.previous")}</Button><Button type="button" variant="outline" size="sm" disabled={loadingPage || data.page >= data.totalPages} onClick={() => { setLoadingPage(true); setError(null); void fetchAiUsage(data.page + 1).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : t("aiUsage.pageFailed"))).finally(() => setLoadingPage(false)); }}>{t("aiUsage.next")}</Button></div>}
		<p className="text-xs text-muted-foreground">{t("aiUsage.note")}</p>
	</div>;
}
