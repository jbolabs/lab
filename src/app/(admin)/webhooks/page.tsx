"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	KeyRound,
	Plus,
	RefreshCw,
	Send,
	Trash2,
	Webhook as WebhookIcon,
} from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
} from "@/components/ui/empty";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { useAdminConfirmation } from "../admin-confirmation-provider";
import { WebhookDeliveries } from "./deliveries";
import type { Webhook, WebhookEvent } from "./types";
import {
	WEBHOOK_EVENTS,
	createWebhook,
	deleteWebhook,
	fetchWebhooks,
	testWebhook,
	updateWebhook,
} from "./utils";

export default function WebhooksPage() {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const qc = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [description, setDescription] = useState("");
	const [maxAttempts, setMaxAttempts] = useState(5);
	const [events, setEvents] = useState<WebhookEvent[]>(
		WEBHOOK_EVENTS.map((e) => e.value)
	);
	const [secret, setSecret] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<Record<string, string>>({});

	const webhooks = useQuery({ queryFn: fetchWebhooks, queryKey: ["webhooks"] });
	const invalidate = () => qc.invalidateQueries({ queryKey: ["webhooks"] });

	const create = useMutation({
		mutationFn: () =>
			createWebhook({
				description: description || undefined,
				events,
				maxAttempts,
				url,
			}),
		onError: (e: Error) => setError(e.message),
		onSuccess: (result) => {
			setSecret(result.secret);
			setUrl("");
			setDescription("");
			setError(null);
			setDialogOpen(false);
			invalidate();
		},
	});

	const toggle = useMutation({
		mutationFn: (hook: Webhook) =>
			updateWebhook(hook.id, { enabled: !hook.enabled }),
		onSuccess: invalidate,
	});
	const rotate = useMutation({
		mutationFn: (id: string) => updateWebhook(id, { rotateSecret: true }),
		onError: (cause: Error) => setError(cause.message),
		onSuccess: (result) => {
			setSecret(result.secret ?? null);
			setError(null);
		},
	});

	const remove = useMutation({
		mutationFn: deleteWebhook,
		onSuccess: invalidate,
	});

	const runTest = useMutation({
		mutationFn: testWebhook,
		onError: (e: Error, id) =>
			setTestResult((prev) => ({ ...prev, [id]: e.message })),
		onSuccess: (result, id) => {
			setTestResult((prev) => ({ ...prev, [id]: result.status }));
			invalidate();
		},
	});

	function toggleEvent(event: WebhookEvent) {
		setEvents((prev) =>
			prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader className="items-end">
				<PageHeaderText>
					<PageTitle>{t("webhooks.title")}</PageTitle>
					<PageDescription>{t("webhooks.description")}</PageDescription>
				</PageHeaderText>
				<PageHeaderActions>
					<Button
						float="mobile"
						onClick={() => {
							setError(null);
							setDialogOpen(true);
						}}
					>
						<Plus data-icon="inline-start" /> {t("webhooks.add")}
					</Button>
				</PageHeaderActions>
			</PageHeader>

			{secret && (
				<Alert variant="info">
					<KeyRound />
					<AlertTitle>{t("webhooks.secretTitle")}</AlertTitle>
					<AlertDescription>
						<p>
							{t("webhooks.secretHint", { header: "\u0001" })
								.split("\u0001")
								.flatMap((part, index) =>
									index === 0
										? [part]
										: [
												<code key={index}>X-Email-Platform-Signature</code>,
												part,
											]
								)}
						</p>
						<code className="block w-full rounded-md bg-card p-2 text-xs break-all text-foreground">
							{secret}
						</code>
						<Button variant="outline" size="sm" onClick={() => setSecret(null)}>
							{t("webhooks.dismiss")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{error && !dialogOpen && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}

			{(() => {
				if (webhooks.isLoading) {
					return <SectionRowSkeleton />;
				}
				if (webhooks.data?.length) {
					return (
						<section className="divide-y divide-border overflow-hidden rounded-lg bg-card">
							{webhooks.data.map((hook) => (
								<div key={hook.id} className="px-5 py-6 sm:px-6">
									<div className="flex flex-wrap items-start justify-between gap-4">
										<div className="min-w-0 flex-1">
											<h2 className="truncate text-base font-semibold text-foreground">
												{hook.url}
											</h2>
											{hook.description && (
												<p className="mt-1 text-sm text-muted-foreground">
													{hook.description}
												</p>
											)}
											<div className="mt-3 flex flex-wrap gap-1.5">
												{hook.events.map((event) => (
													<Badge key={event} variant="secondary">
														{event}
													</Badge>
												))}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-xs font-medium text-muted-foreground">
												{hook.enabled
													? t("webhooks.enabled")
													: t("webhooks.disabled")}
											</span>
											<Switch
												checked={hook.enabled}
												onCheckedChange={() => toggle.mutate(hook)}
												aria-label={t(
													hook.enabled
														? "webhooks.toggleLabel.disable"
														: "webhooks.toggleLabel.enable",
													{ url: hook.url }
												)}
											/>
										</div>
									</div>
									<div className="mt-5 grid grid-cols-2 overflow-hidden rounded-lg bg-muted/60 sm:grid-cols-5">
										<div className="px-4 py-3">
											<span className="block text-lg font-semibold text-foreground">
												{hook.stats.total}
											</span>
											<span className="block text-xs text-muted-foreground">
												{t("webhooks.stat.deliveries")}
											</span>
										</div>
										<div className="px-4 py-3">
											<span
												className={cn(
													"block text-lg font-semibold",
													hook.stats.delivered
														? "text-success"
														: "text-muted-foreground"
												)}
											>
												{hook.stats.delivered}
											</span>
											<span className="block text-xs text-muted-foreground">
												{t("webhooks.stat.delivered")}
											</span>
										</div>
										<div className="px-4 py-3">
											<span
												className={cn(
													"block text-lg font-semibold",
													hook.stats.pending
														? "text-warning"
														: "text-muted-foreground"
												)}
											>
												{hook.stats.pending}
											</span>
											<span className="block text-xs text-muted-foreground">
												{t("webhooks.stat.inFlight")}
											</span>
										</div>
										<div className="px-4 py-3">
											<span
												className={cn(
													"block text-lg font-semibold",
													hook.stats.failing
														? "text-destructive"
														: "text-muted-foreground"
												)}
											>
												{hook.stats.failing}
											</span>
											<span className="block text-xs text-muted-foreground">
												{t("webhooks.stat.failed")}
											</span>
										</div>
										<div className="px-4 py-3">
											<span className="block text-lg font-semibold text-muted-foreground">
												{hook.maxAttempts}
											</span>
											<span className="block text-xs text-muted-foreground">
												{t("webhooks.stat.maxAttempts")}
											</span>
										</div>
									</div>

									<div className="mt-4 flex flex-wrap items-center gap-3">
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												setExpanded(expanded === hook.id ? null : hook.id)
											}
										>
											<Activity data-icon="inline-start" />
											{expanded === hook.id
												? t("webhooks.hideHistory")
												: t("webhooks.history")}
										</Button>
										<div className="ml-auto flex flex-wrap items-center gap-2">
											{testResult[hook.id] && (
												<p className="mr-1 text-sm text-muted-foreground">
													{t("webhooks.testDelivery", {
														result: testResult[hook.id],
													})}
												</p>
											)}
											<Button
												variant="ghost"
												size="sm"
												onClick={() => runTest.mutate(hook.id)}
												disabled={runTest.isPending}
											>
												<Send data-icon="inline-start" /> {t("webhooks.test")}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={async () => {
													if (await confirm(t("webhooks.rotateConfirm"))) {
														rotate.mutate(hook.id);
													}
												}}
												disabled={rotate.isPending}
											>
												<RefreshCw data-icon="inline-start" />{" "}
												{t("webhooks.rotate")}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => remove.mutate(hook.id)}
												aria-label={t("webhooks.deleteLabel", {
													url: hook.url,
												})}
											>
												<Trash2 data-icon="inline-start" /> {t("common.delete")}
											</Button>
										</div>
									</div>

									{expanded === hook.id && (
										<div className="mt-4">
											<WebhookDeliveries webhookId={hook.id} />
										</div>
									)}
								</div>
							))}
						</section>
					);
				}
				return (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<WebhookIcon />
							</EmptyMedia>
							<EmptyDescription>{t("webhooks.none")}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				);
			})()}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{t("webhooks.add")}</DialogTitle>
						<DialogDescription>
							{t("webhooks.addDescription")}
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							create.mutate();
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="hook-url">
									{t("webhooks.endpointUrl")}
								</FieldLabel>
								<Input
									id="hook-url"
									type="url"
									required
									value={url}
									onChange={(e) => setUrl(e.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="hook-description">
									{t("webhooks.descriptionLabel")}
								</FieldLabel>
								<Input
									id="hook-description"
									value={description}
									placeholder={t("webhooks.optional")}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</Field>
							<FieldSet>
								<FieldLegend variant="label">
									{t("webhooks.events")}
								</FieldLegend>
								<div className="flex flex-col gap-2">
									{WEBHOOK_EVENTS.map((event) => (
										<FieldLabel
											key={event.value}
											htmlFor={`hook-event-${event.value}`}
										>
											<Field orientation="horizontal">
												<FieldContent>
													<FieldTitle>{t(event.labelKey)}</FieldTitle>
													<FieldDescription>
														{t(event.hintKey)}
													</FieldDescription>
												</FieldContent>
												<Checkbox
													id={`hook-event-${event.value}`}
													checked={events.includes(event.value)}
													onCheckedChange={() => toggleEvent(event.value)}
												/>
											</Field>
										</FieldLabel>
									))}
								</div>
							</FieldSet>
							<Field>
								<FieldLabel htmlFor="hook-attempts">
									{t("webhooks.stat.maxAttempts")}
								</FieldLabel>
								<Input
									id="hook-attempts"
									type="number"
									min={1}
									max={10}
									value={maxAttempts}
									onChange={(e) => setMaxAttempts(Number(e.target.value))}
								/>
							</Field>

							{error && (
								<p role="alert" className="text-sm text-destructive">
									{error}
								</p>
							)}

							<div className="flex justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => setDialogOpen(false)}
								>
									{t("common.cancel")}
								</Button>
								<Button
									type="submit"
									disabled={create.isPending || events.length === 0}
								>
									<RefreshCw
										data-icon="inline-start"
										className={create.isPending ? "animate-spin" : "hidden"}
									/>
									{t("webhooks.create")}
								</Button>
							</div>
						</FieldGroup>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
