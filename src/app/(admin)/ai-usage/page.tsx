"use client";
import { useEffect, useState } from "react";

import Link from "@/components/app-link";
import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";
import { runAsyncAction } from "@/lib/async-cleanup";

import type { AiUsageResponse } from "./types";
import { UsageChart } from "./usage-chart";
import {
	fetchAiUsage,
	formatEstimatedUsd,
	formatTokenCount,
	formatUsageDate,
	formatUsageProvider,
} from "./utils";

export default function AiUsagePage() {
	const { t } = useLanguage();
	const [data, setData] = useState<AiUsageResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loadingPage, setLoadingPage] = useState(false);

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const result = await fetchAiUsage(1);
				if (active) {
					setData(result);
				}
			},
			(error_) => {
				if (active) {
					setError(
						error_ instanceof Error ? error_.message : t("aiUsage.loadFailed")
					);
				}
			}
		);
		return () => {
			active = false;
		};
	}, [t]);

	const totals = data?.totals;
	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("aiUsage.title")}</PageTitle>
					<PageDescription>{t("aiUsage.description")}</PageDescription>
				</PageHeaderText>
				<PageHeaderActions>
					{/* The phone top bar has the back button. */}
					<Button
						variant="link"
						className="max-md:hidden"
						render={<Link href="/agent" />}
						nativeButton={false}
					>
						{t("aiUsage.back")}
					</Button>
				</PageHeaderActions>
			</PageHeader>
			{error && (
				<Alert variant="error">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<div className="grid gap-4 sm:grid-cols-3">
				<section className="rounded-lg bg-card p-5">
					<p className="text-sm text-muted-foreground">
						{t("aiUsage.totalTokens")}
					</p>
					<p className="mt-2 text-2xl font-semibold text-foreground">
						{totals ? formatTokenCount(totals.totalTokens) : "—"}
					</p>
				</section>
				<section className="rounded-lg bg-card p-5">
					<p className="text-sm text-muted-foreground">
						{t("aiUsage.totalRequests")}
					</p>
					<p className="mt-2 text-2xl font-semibold text-foreground">
						{totals ? formatTokenCount(totals.requests) : "—"}
					</p>
				</section>
				<section className="rounded-lg bg-card p-5">
					<p className="text-sm text-muted-foreground">{t("aiUsage.spend")}</p>
					<p className="mt-2 text-2xl font-semibold text-foreground">
						{totals && totals.pricedRequests
							? formatEstimatedUsd(totals.costUsdMicros)
							: "—"}
					</p>
					{totals && totals.pricedRequests < totals.requests && (
						<p className="mt-1 text-xs text-muted-foreground">
							{t("aiUsage.noRate", {
								count: formatTokenCount(
									totals.requests - totals.pricedRequests
								),
							})}
						</p>
					)}
				</section>
			</div>
			<UsageChart daily={data?.daily ?? []} timeZone={data?.timeZone} />
			<section
				aria-label={t("aiUsage.title")}
				className="overflow-x-auto rounded-lg bg-card"
				aria-busy={loadingPage}
			>
				<Table className="w-full min-w-[850px] text-left">
					<TableHeader className="">
						<TableRow>
							<TableHead scope="col" className="">
								{t("aiUsage.col.dateTime")}
							</TableHead>
							<TableHead scope="col" className="">
								{t("aiUsage.col.model")}
							</TableHead>
							<TableHead scope="col" className="">
								{t("aiUsage.col.provider")}
							</TableHead>
							<TableHead scope="col" className="text-right">
								{t("aiUsage.col.input")}
							</TableHead>
							<TableHead scope="col" className="text-right">
								{t("aiUsage.col.output")}
							</TableHead>
							<TableHead scope="col" className="text-right">
								{t("aiUsage.col.spending")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody className="">
						{data?.rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell className="whitespace-nowrap">
									{formatUsageDate(row.createdAt)}
								</TableCell>
								<TableCell className="max-w-56 break-all">
									{row.model}
								</TableCell>
								<TableCell className="">
									{formatUsageProvider(row.provider)}
								</TableCell>
								<TableCell className="text-right">
									{formatTokenCount(row.inputTokens)}
								</TableCell>
								<TableCell className="text-right">
									{formatTokenCount(row.outputTokens)}
								</TableCell>
								<TableCell className="text-right">
									{formatEstimatedUsd(row.costUsdMicros)}
								</TableCell>
							</TableRow>
						))}
						{data && data.rows.length === 0 && (
							<TableRow>
								<TableCell colSpan={6} className="text-center">
									{t("aiUsage.none")}
								</TableCell>
							</TableRow>
						)}
						{!data && !error && (
							<TableRow>
								<TableCell colSpan={6} className="text-center">
									{t("aiUsage.loading")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</section>
			{data && (
				<div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
					<span>
						{t("aiUsage.pageOf", {
							page: data.page,
							size: data.pageSize,
							total: data.totalPages,
						})}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={loadingPage || data.page <= 1}
						onClick={() => {
							setLoadingPage(true);
							setError(null);
							runAsyncAction(
								async () => {
									const result0 = await fetchAiUsage(data.page - 1);
									return await setData(result0);
								},
								(error_) =>
									setError(
										error_ instanceof Error
											? error_.message
											: t("aiUsage.pageFailed")
									),
								() => setLoadingPage(false)
							);
						}}
					>
						{t("aiUsage.previous")}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={loadingPage || data.page >= data.totalPages}
						onClick={() => {
							setLoadingPage(true);
							setError(null);
							runAsyncAction(
								async () => {
									const result0 = await fetchAiUsage(data.page + 1);
									return await setData(result0);
								},
								(error_) =>
									setError(
										error_ instanceof Error
											? error_.message
											: t("aiUsage.pageFailed")
									),
								() => setLoadingPage(false)
							);
						}}
					>
						{t("aiUsage.next")}
					</Button>
				</div>
			)}
			<p className="text-xs text-muted-foreground">{t("aiUsage.note")}</p>
		</div>
	);
}
