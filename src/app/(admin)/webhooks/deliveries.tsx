"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";

import {
	DELIVERY_STATUS_BADGE,
	DELIVERY_STATUS_LABELS,
	fetchDeliveries,
	formatDuration,
	formatTimestamp,
	isRetryable,
	retryDelivery,
} from "./utils";

export function WebhookDeliveries({ webhookId }: { webhookId: string }) {
	const { t } = useLanguage();
	const qc = useQueryClient();
	const deliveries = useQuery({
		queryFn: () => fetchDeliveries(webhookId),
		queryKey: ["webhook-deliveries", webhookId],
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
		return (
			<p className="text-sm text-muted-foreground">
				{t("webhooks.loadingDeliveries")}
			</p>
		);
	}

	if (!deliveries.data?.length) {
		return (
			<p className="text-sm text-muted-foreground">
				{t("webhooks.noDeliveries")}
			</p>
		);
	}

	return (
		<section
			aria-label={t("webhooks.stat.deliveries")}
			className="overflow-x-auto rounded-lg border"
		>
			<Table className="w-full min-w-[820px] text-left">
				<TableHeader className="">
					<TableRow>
						<TableHead scope="col" className="">
							{t("webhooks.col.event")}
						</TableHead>
						<TableHead scope="col" className="">
							{t("webhooks.col.status")}
						</TableHead>
						<TableHead scope="col" className="">
							{t("webhooks.col.attempts")}
						</TableHead>
						<TableHead scope="col" className="">
							{t("webhooks.col.response")}
						</TableHead>
						<TableHead scope="col" className="">
							{t("webhooks.col.lastAttempt")}
						</TableHead>
						<TableHead scope="col" className="">
							{t("webhooks.col.nextRetry")}
						</TableHead>
						<TableHead scope="col" className="" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{deliveries.data.map((delivery) => (
						<TableRow key={delivery.id} className="align-top">
							<TableCell className="">
								<span className="block">{delivery.eventType}</span>
								<span className="block text-xs text-muted-foreground">
									{formatTimestamp(delivery.createdAt)}
								</span>
							</TableCell>
							<TableCell className="">
								<Badge variant={DELIVERY_STATUS_BADGE[delivery.status]}>
									{DELIVERY_STATUS_LABELS[delivery.status]
										? t(DELIVERY_STATUS_LABELS[delivery.status])
										: delivery.status}
								</Badge>
							</TableCell>
							<TableCell className="whitespace-nowrap">
								{/* Manual retries can push attempts past the configured max, so never show "3 / 2". */}
								{delivery.attempts} /{" "}
								{Math.max(delivery.maxAttempts, delivery.attempts)}
							</TableCell>
							<TableCell className="">
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
									<span
										className="mt-1 block max-w-xs truncate text-xs text-destructive"
										title={delivery.error}
									>
										{delivery.error}
									</span>
								)}
							</TableCell>
							<TableCell className="whitespace-nowrap">
								{formatTimestamp(delivery.lastAttemptAt)}
							</TableCell>
							<TableCell className="whitespace-nowrap">
								{formatTimestamp(delivery.nextRetryAt)}
							</TableCell>
							<TableCell className="">
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
		</section>
	);
}
