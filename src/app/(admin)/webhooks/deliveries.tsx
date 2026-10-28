"use client";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WebhookDelivery } from "./types";
import {
	DELIVERY_STATUS_LABELS,
	fetchDeliveries,
	formatDuration,
	formatTimestamp,
	isRetryable,
	retryDelivery,
} from "./utils";

const STATUS_STYLES: Record<WebhookDelivery["status"], string> = {
	delivered: "bg-green-600/10 text-green-700",
	failed: "bg-red-600/10 text-red-700",
	exhausted: "bg-red-600/10 text-red-700",
	retrying: "bg-amber-500/10 text-amber-700",
	pending: "bg-accent text-foreground/80",
};

export function WebhookDeliveries({ webhookId }: { webhookId: string }) {
	const { t } = useLanguage();
	const qc = useQueryClient();
	const deliveries = useQuery({
		queryKey: ["webhook-deliveries", webhookId],
		queryFn: () => fetchDeliveries(webhookId),
		// Retries land asynchronously from the queue, so keep the table fresh while it is open.
		refetchInterval: 15_000,
	});

	const retry = useMutation({
		mutationFn: (deliveryId: string) => retryDelivery(webhookId, deliveryId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] });
			qc.invalidateQueries({ queryKey: ["webhooks"] });
		},
	});

	if (deliveries.isLoading) {
		return <p className="text-sm text-muted-foreground">{t("webhooks.loadingDeliveries")}</p>;
	}

	if (!deliveries.data?.length) {
		return <p className="text-sm text-muted-foreground">{t("webhooks.noDeliveries")}</p>;
	}

	return (
		<div role="region" tabIndex={0} aria-label={t("webhooks.stat.deliveries")} className="overflow-x-auto rounded-xl border border-border">
			<Table className="w-full min-w-[820px] text-left text-sm">
				<TableHeader className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
					<TableRow>
						<TableHead scope="col" className="px-3 py-2 font-medium">{t("webhooks.col.event")}</TableHead>
						<TableHead scope="col" className="px-3 py-2 font-medium">{t("webhooks.col.status")}</TableHead>
						<TableHead scope="col" className="px-3 py-2 font-medium">{t("webhooks.col.attempts")}</TableHead>
						<TableHead scope="col" className="px-3 py-2 font-medium">{t("webhooks.col.response")}</TableHead>
						<TableHead scope="col" className="px-3 py-2 font-medium">{t("webhooks.col.lastAttempt")}</TableHead>
						<TableHead scope="col" className="px-3 py-2 font-medium">{t("webhooks.col.nextRetry")}</TableHead>
						<TableHead scope="col" className="px-3 py-2 font-medium" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{deliveries.data.map((delivery) => (
						<TableRow key={delivery.id} className="border-t border-border align-top">
							<TableCell className="px-3 py-2">
								<span className="block">{delivery.eventType}</span>
								<span className="block text-xs text-muted-foreground">
									{formatTimestamp(delivery.createdAt)}
								</span>
							</TableCell>
							<TableCell className="px-3 py-2">
								<Badge className={STATUS_STYLES[delivery.status]}>
									{DELIVERY_STATUS_LABELS[delivery.status] ? t(DELIVERY_STATUS_LABELS[delivery.status]) : delivery.status}
								</Badge>
							</TableCell>
							<TableCell className="px-3 py-2 whitespace-nowrap">
								{/* Manual retries can push attempts past the configured max, so never show "3 / 2". */}
								{delivery.attempts} / {Math.max(delivery.maxAttempts, delivery.attempts)}
							</TableCell>
							<TableCell className="px-3 py-2">
								<span className="block whitespace-nowrap">
									{delivery.responseStatus ?? "—"}
									{delivery.durationMs !== null && (
										// An explicit separator: "200" next to "6ms" otherwise reads as "2006ms".
										<span className="ml-1 text-xs text-muted-foreground">
											· {formatDuration(delivery.durationMs)}
										</span>
									)}
								</span>
								{delivery.error && (
									<span className="mt-1 block max-w-xs truncate text-xs text-red-600" title={delivery.error}>
										{delivery.error}
									</span>
								)}
							</TableCell>
							<TableCell className="px-3 py-2 whitespace-nowrap text-muted-foreground">
								{formatTimestamp(delivery.lastAttemptAt)}
							</TableCell>
							<TableCell className="px-3 py-2 whitespace-nowrap text-muted-foreground">
								{formatTimestamp(delivery.nextRetryAt)}
							</TableCell>
							<TableCell className="px-3 py-2">
								{isRetryable(delivery) && (
									<Button
										variant="outline"
										size="sm"
										disabled={retry.isPending}
										onClick={() => retry.mutate(delivery.id)}
									>
										<RotateCw data-icon="inline-start" /> {t("webhooks.retry")}
									</Button>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
