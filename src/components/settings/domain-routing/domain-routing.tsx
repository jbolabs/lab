"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Forward, Inbox, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { CardGridSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canManageDomains } from "@/lib/auth/admin";

import { useSettingsConfirm } from "../settings-confirm";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../settings-dialog";
import { SettingsRowActions } from "../settings-row-actions";
import { RoutingRuleSelect } from "./routing-rule-select";
import type { DomainRoutingProps, DomainRule, DomainRuleInput } from "./types";
import {
	ACTION_LABELS,
	MATCH_FIELD_LABELS,
	MATCH_OPERATOR_LABELS,
	createDomainRule,
	deleteDomainRule,
	describeRule,
	emptyRuleInput,
	fetchDomainRules,
	formatLastMatched,
	ruleToInput,
	updateDomainRule,
} from "./utils";

const ACTION_ICONS = {
	forward: Forward,
	reject: Ban,
	store: Inbox,
} as const;
function RuleSection({
	title,
	description,
	rules,
	hostname,
	mailboxes,
	onEdit,
	onDelete,
	onToggle,
}: {
	title: string;
	description: string;
	rules: DomainRule[];
	hostname: string;
	mailboxes: {
		id: string;
		localPart: string;
		displayName: string | null;
		disabled: boolean;
	}[];
	onEdit: (rule: DomainRule) => void;
	onDelete: (id: string) => void;
	onToggle: (rule: DomainRule) => void;
}) {
	const { t } = useLanguage();
	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center gap-1">
				<h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{title}
				</h4>
				<HintTooltip label={description}>
					<Button
						type="button"
						aria-label={description}
						variant="ghost"
						size="icon-sm"
					>
						<Info data-icon="inline-start" />
					</Button>
				</HintTooltip>
			</div>
			{rules.length === 0 ? (
				<Empty>
					<EmptyDescription>{t("routing.noRules")}</EmptyDescription>
				</Empty>
			) : (
				<div className="flex flex-col gap-2">
					{rules.map((rule) => {
						const Icon = ACTION_ICONS[rule.action];
						const ruleName =
							rule.name || describeRule(rule, mailboxes, hostname, t);
						return (
							<Item key={rule.id} variant="outline" size="sm">
								<ItemMedia>
									<Icon className="size-4 text-muted-foreground" />
								</ItemMedia>
								<ItemContent className="min-w-0">
									<ItemTitle className="w-full min-w-0">
										<span className="truncate">{ruleName}</span>
										{!rule.enabled && (
											<Badge variant="secondary">{t("routing.disabled")}</Badge>
										)}
									</ItemTitle>
									{rule.name && (
										<p className="truncate text-xs text-muted-foreground">
											{describeRule(rule, mailboxes, hostname, t)}
										</p>
									)}
									<p className="text-xs text-muted-foreground">
										{t("routing.stats", {
											count: rule.matchCount,
											last: formatLastMatched(rule.lastMatchedAt, t),
											priority: rule.priority,
										})}
									</p>
								</ItemContent>
								<ItemActions>
									<Switch
										checked={rule.enabled}
										onCheckedChange={() => onToggle(rule)}
										aria-label={`${t("routing.enableRule")}: ${ruleName}`}
									/>
									<SettingsRowActions>
										<DropdownMenuItem
											onClick={() => onEdit(rule)}
											aria-label={`${t("routing.editRule")}: ${ruleName}`}
										>
											<Pencil data-icon="inline-start" />
											{t("routing.editRule")}
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => onDelete(rule.id)}
											aria-label={`${t("rules.delete")}: ${ruleName}`}
										>
											<Trash2 data-icon="inline-start" />
											{t("rules.delete")}
										</DropdownMenuItem>
									</SettingsRowActions>
								</ItemActions>
							</Item>
						);
					})}
				</div>
			)}
		</section>
	);
}

export function DomainRouting({ domain }: DomainRoutingProps = {}) {
	const { t } = useLanguage();
	const { confirm, confirmation } = useSettingsConfirm();
	const qc = useQueryClient();
	const { selectedMailbox, isLoading: isMailboxLoading } = useSelectedMailbox();
	const currentUser = useCurrentUser();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<DomainRule | null>(null);
	const [form, setForm] = useState<DomainRuleInput>(emptyRuleInput(""));
	const [error, setError] = useState<string | null>(null);
	const routingDomain = domain ?? {
		hostname: selectedMailbox?.hostname ?? "",
		id: selectedMailbox?.domainId ?? "",
	};
	const domainId = routingDomain.id;
	const mailboxId = selectedMailbox?.id ?? "";
	const canManage = !!currentUser && canManageDomains(currentUser);
	const rulesQueryKey = ["domain-rules", domainId] as const;
	const rules = useQuery({
		enabled: !!domainId && canManage,
		queryFn: () => fetchDomainRules(domainId),
		queryKey: rulesQueryKey,
	});
	const { hostname } = routingDomain;
	const mailboxes = rules.data?.mailboxes ?? [];
	const save = useMutation({
		mutationFn: () => {
			const payload: DomainRuleInput = { ...form, domainId };
			return editing
				? updateDomainRule(editing.id, payload)
				: createDomainRule(payload);
		},
		onError: (e: Error) => setError(e.message),
		onSuccess: () => {
			setDialogOpen(false);
			setEditing(null);
			setError(null);
			qc.invalidateQueries({ queryKey: rulesQueryKey });
		},
	});
	const remove = useMutation({
		mutationFn: (id: string) => deleteDomainRule(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: rulesQueryKey }),
	});
	const toggle = useMutation({
		mutationFn: (rule: DomainRule) =>
			updateDomainRule(rule.id, {
				...ruleToInput(rule),
				enabled: !rule.enabled,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: rulesQueryKey }),
	});
	function openCreate() {
		setEditing(null);
		setError(null);
		setForm(emptyRuleInput(domainId));
		setDialogOpen(true);
	}
	function openEdit(rule: DomainRule) {
		setEditing(rule);
		setError(null);
		setForm(ruleToInput(rule));
		setDialogOpen(true);
	}
	const blockRules = (rules.data?.rules ?? []).filter(
		(r) => r.action === "reject"
	);
	const fallbackRules = (rules.data?.rules ?? []).filter(
		(r) => r.action !== "reject"
	);
	if (!canManage) {
		return null;
	}
	function renderRuleSections() {
		if ((!domain && isMailboxLoading) || rules.isLoading) {
			return <CardGridSkeleton />;
		}
		if (!domain && !mailboxId) {
			return (
				<Empty>
					<EmptyDescription>{t("routing.selectInboxFirst")}</EmptyDescription>
				</Empty>
			);
		}
		return (
			<div className="flex flex-col gap-6">
				<RuleSection
					title={t("routing.blockRules")}
					description={t("routing.blockRulesDescription")}
					rules={blockRules}
					hostname={hostname}
					mailboxes={mailboxes}
					onEdit={openEdit}
					onDelete={async (id) => {
						if (await confirm(t("rules.delete"))) {
							remove.mutate(id);
						}
					}}
					onToggle={(rule) => toggle.mutate(rule)}
				/>
				<RuleSection
					title={t("routing.catchAll")}
					description={t("routing.catchAllDescription")}
					rules={fallbackRules}
					hostname={hostname}
					mailboxes={mailboxes}
					onEdit={openEdit}
					onDelete={async (id) => {
						if (await confirm(t("rules.delete"))) {
							remove.mutate(id);
						}
					}}
					onToggle={(rule) => toggle.mutate(rule)}
				/>
			</div>
		);
	}
	function renderRoutingCard() {
		return (
			<Card>
				{confirmation}
				<CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
					<div className="flex min-w-0 flex-col gap-1.5">
						<div className="flex items-center gap-2">
							<CardTitle>{t("routing.title")}</CardTitle>
							<HintTooltip label={t("routing.about")}>
								<Button
									type="button"
									aria-label={t("routing.aboutLabel")}
									variant="ghost"
									size="icon-sm"
								>
									<Info data-icon="inline-start" />
								</Button>
							</HintTooltip>
						</div>
						<CardDescription>
							{t("routing.rulesFor", {
								host: hostname || t("routing.selectInbox"),
							})}
						</CardDescription>
					</div>
					<Button onClick={openCreate} disabled={!domainId}>
						<Plus data-icon="inline-start" /> {t("routing.addRoute")}
					</Button>
				</CardHeader>

				<CardContent>{renderRuleSections()}</CardContent>

				<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					{/* The form grows when the action changes, so the dialog must scroll rather than overflow the viewport. */}
					<DialogContent className="max-h-[calc(100dvh_-_4rem)] overflow-y-auto sm:max-w-140">
						<DialogHeader>
							<DialogTitle>
								{editing ? t("routing.editRule") : t("routing.addRule")}
							</DialogTitle>
							<DialogDescription>
								{t("routing.dialogDescription")}
							</DialogDescription>
						</DialogHeader>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								save.mutate();
							}}
						>
							<FieldGroup>
								<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
									<Field>
										<FieldLabel htmlFor="rule-name">
											{t("common.name")}
										</FieldLabel>
										<Input
											id="rule-name"
											value={form.name ?? ""}
											placeholder={t("routing.optionalLabel")}
											onChange={(e) =>
												setForm({ ...form, name: e.target.value })
											}
										/>
									</Field>

									<Field>
										<FieldLabel htmlFor="rule-action">
											{t("routing.action")}
										</FieldLabel>
										<RoutingRuleSelect
											id="rule-action"
											value={form.action}
											onChange={(e) =>
												setForm({
													...form,
													action: e.target.value as DomainRuleInput["action"],
												})
											}
										>
											{Object.entries(ACTION_LABELS).map(([value, label]) => (
												<option key={value} value={value}>
													{t(label)}
												</option>
											))}
										</RoutingRuleSelect>
									</Field>
								</div>

								<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
									<Field>
										<FieldLabel htmlFor="rule-field">
											{t("routing.matchOn")}
										</FieldLabel>
										<RoutingRuleSelect
											id="rule-field"
											value={form.matchField}
											onChange={(e) =>
												setForm({
													...form,
													matchField: e.target
														.value as DomainRuleInput["matchField"],
												})
											}
										>
											{Object.entries(MATCH_FIELD_LABELS).map(
												([value, label]) => (
													<option key={value} value={value}>
														{t(label)}
													</option>
												)
											)}
										</RoutingRuleSelect>
									</Field>
									<Field>
										<FieldLabel htmlFor="rule-operator">
											{t("routing.condition")}
										</FieldLabel>
										<RoutingRuleSelect
											id="rule-operator"
											value={form.matchOperator}
											onChange={(e) =>
												setForm({
													...form,
													matchOperator: e.target
														.value as DomainRuleInput["matchOperator"],
												})
											}
										>
											{Object.entries(MATCH_OPERATOR_LABELS).map(
												([value, label]) => (
													<option key={value} value={value}>
														{t(label)}
													</option>
												)
											)}
										</RoutingRuleSelect>
									</Field>
								</div>

								<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
									<Field className="min-w-0">
										<div className="flex items-center gap-1">
											<FieldLabel htmlFor="rule-value">
												{t("routing.matchValue")}
											</FieldLabel>
											<HintTooltip label={t("routing.matchAllHint")}>
												<Button
													type="button"
													aria-label={t("routing.matchAllHint")}
													variant="ghost"
													size="icon-sm"
												>
													<Info data-icon="inline-start" />
												</Button>
											</HintTooltip>
										</div>
										<Input
											id="rule-value"
											required
											value={form.matchValue}
											placeholder={t("routing.matchAllPlaceholder")}
											onChange={(e) =>
												setForm({ ...form, matchValue: e.target.value })
											}
										/>
									</Field>
									<Field className="min-w-0">
										<div className="flex items-center gap-1">
											<FieldLabel htmlFor="rule-priority">
												{t("routing.priority")}
											</FieldLabel>
											<HintTooltip label={t("routing.priorityHint")}>
												<Button
													type="button"
													aria-label={t("routing.priorityHint")}
													variant="ghost"
													size="icon-sm"
												>
													<Info data-icon="inline-start" />
												</Button>
											</HintTooltip>
										</div>
										<Input
											id="rule-priority"
											type="number"
											min={0}
											max={1000}
											value={form.priority}
											onChange={(e) =>
												setForm({ ...form, priority: Number(e.target.value) })
											}
										/>
									</Field>
								</div>

								{form.action !== "reject" && (
									<div
										className={
											form.action === "forward"
												? "grid grid-cols-1 items-end gap-4 sm:grid-cols-2"
												: "grid min-w-0 gap-2"
										}
									>
										<Field>
											<FieldLabel htmlFor="rule-mailbox">
												{form.action === "forward"
													? t("routing.keptCopyMailbox")
													: t("routing.destinationMailbox")}
											</FieldLabel>
											<RoutingRuleSelect
												id="rule-mailbox"
												value={form.mailboxId ?? ""}
												onChange={(e) =>
													setForm({
														...form,
														mailboxId: e.target.value || null,
													})
												}
											>
												<option value="">{t("routing.selectMailbox")}</option>
												{mailboxes.map((mailbox) => (
													<option key={mailbox.id} value={mailbox.id}>
														{mailbox.localPart}@{hostname}
														{mailbox.disabled
															? t("routing.disabledSuffix")
															: ""}
													</option>
												))}
											</RoutingRuleSelect>
										</Field>
										{form.action === "forward" && (
											<Field>
												<FieldLabel htmlFor="rule-forward">
													{t("routing.forwardTo")}
												</FieldLabel>
												<Input
													id="rule-forward"
													type="email"
													required
													value={form.forwardTo ?? ""}
													onChange={(e) =>
														setForm({ ...form, forwardTo: e.target.value })
													}
												/>
											</Field>
										)}
									</div>
								)}

								{form.action === "forward" && (
									<div className="flex items-center justify-between rounded-lg border px-3 py-2">
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium">
												{t("routing.keepCopy")}
											</p>
											<HintTooltip label={t("routing.keepCopyHint")}>
												<Button
													type="button"
													aria-label={t("routing.keepCopyHint")}
													variant="ghost"
													size="icon-sm"
												>
													<Info data-icon="inline-start" />
												</Button>
											</HintTooltip>
										</div>
										<Switch
											checked={form.keepCopy}
											onCheckedChange={(keepCopy) =>
												setForm({ ...form, keepCopy })
											}
											aria-label={t("routing.keepCopy")}
										/>
									</div>
								)}

								{form.action === "reject" && (
									<Field>
										<FieldLabel htmlFor="rule-reason">
											{t("routing.rejectReason")}
										</FieldLabel>
										<Input
											id="rule-reason"
											value={form.rejectReason ?? ""}
											placeholder={t("routing.rejectPlaceholder")}
											onChange={(e) =>
												setForm({ ...form, rejectReason: e.target.value })
											}
										/>
									</Field>
								)}

								{error && (
									<Alert variant="destructive">
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}

								<div className="flex justify-end gap-2 border-t pt-4">
									<Button
										type="button"
										variant="outline"
										onClick={() => setDialogOpen(false)}
									>
										{t("common.cancel")}
									</Button>
									<Button type="submit" disabled={save.isPending}>
										{editing ? t("rules.saveChanges") : t("rules.create")}
									</Button>
								</div>
							</FieldGroup>
						</form>
					</DialogContent>
				</Dialog>
			</Card>
		);
	}

	return renderRoutingCard();
}
