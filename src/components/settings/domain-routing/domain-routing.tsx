"use client";
import { Item } from "@/components/ui/item";
import { SettingsRowActions } from "../settings-row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettingsConfirm } from "../settings-confirm";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Forward, Inbox, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../settings-dialog";
import { Input } from "@/components/ui/input";
import { RoutingRuleSelect } from "./routing-rule-select";
import { Switch } from "@/components/ui/switch";
import { HintTooltip } from "@/components/hint-tooltip";
import { CardGridSkeleton } from "@/components/page-skeletons";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canManageDomains } from "@/lib/auth/admin";
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
	store: Inbox,
	forward: Forward,
	reject: Ban,
} as const;
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
	const domainId = domain?.id ?? selectedMailbox?.domainId ?? "";
	const mailboxId = selectedMailbox?.id ?? "";
	const canManage = !!currentUser && canManageDomains(currentUser);
	const rulesQueryKey = ["domain-rules", domainId] as const;
	const rules = useQuery({
		queryKey: rulesQueryKey,
		enabled: !!domainId && canManage,
		queryFn: () => fetchDomainRules(domainId),
	});
	const hostname = domain?.hostname ?? selectedMailbox?.hostname ?? "";
	const mailboxes = rules.data?.mailboxes ?? [];
	const save = useMutation({
		mutationFn: () => {
			const payload: DomainRuleInput = { ...form, domainId };
			return editing
				? updateDomainRule(editing.id, payload)
				: createDomainRule(payload);
		},
		onSuccess: () => {
			setDialogOpen(false);
			setEditing(null);
			setError(null);
			qc.invalidateQueries({ queryKey: rulesQueryKey });
		},
		onError: (e: Error) => setError(e.message),
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
		(r) => r.action === "reject",
	);
	const fallbackRules = (rules.data?.rules ?? []).filter(
		(r) => r.action !== "reject",
	);
	if (!canManage) return null;
	return (
		<div className="flex flex-col gap-6">
			{confirmation}
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h2 className="text-2xl font-semibold">{t("routing.title")}</h2>
						<HintTooltip label={t("routing.about")}>
							<Button
								type="button"
								aria-label={t("routing.aboutLabel")}
								variant="ghost"
								size="icon"
							>
								<Info data-icon="inline-start" />
							</Button>
						</HintTooltip>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("routing.rulesFor", {
							host: hostname || t("routing.selectInbox"),
						})}
					</p>
				</div>
				<div className="flex items-end gap-2">
					<Button onClick={openCreate} disabled={!domainId}>
						<Plus data-icon="inline-start" /> {t("routing.addRoute")}
					</Button>
				</div>
			</div>

			{(!domain && isMailboxLoading) || rules.isLoading ? (
				<CardGridSkeleton />
			) : !domain && !mailboxId ? (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						{t("routing.selectInboxFirst")}
					</CardContent>
				</Card>
			) : (
				<div className="flex flex-col gap-1 overflow-hidden rounded-lg">
					<RuleSection
						className="rounded-b-lg "
						title={t("routing.blockRules")}
						description={t("routing.blockRulesDescription")}
						rules={blockRules}
						hostname={hostname}
						mailboxes={mailboxes}
						onEdit={openEdit}
						onDelete={async (id) => {
							if (await confirm(t("rules.delete"))) remove.mutate(id);
						}}
						onToggle={(rule) => toggle.mutate(rule)}
					/>
					<RuleSection
						className=" rounded-t-lg"
						title={t("routing.catchAll")}
						description={t("routing.catchAllDescription")}
						rules={fallbackRules}
						hostname={hostname}
						mailboxes={mailboxes}
						onEdit={openEdit}
						onDelete={async (id) => {
							if (await confirm(t("rules.delete"))) remove.mutate(id);
						}}
						onToggle={(rule) => toggle.mutate(rule)}
					/>
				</div>
			)}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				{/* The form grows when the action changes, so the dialog must scroll rather than overflow the viewport. */}
				<DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-[560px]">
					<DialogHeader>
						<DialogTitle>
							{editing ? t("routing.editRule") : t("routing.addRule")}
						</DialogTitle>
						<DialogDescription>
							{t("routing.dialogDescription")}
						</DialogDescription>
					</DialogHeader>

					<form
						className="flex flex-col gap-4"
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
										onChange={(e) => setForm({ ...form, name: e.target.value })}
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
											),
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
											),
										)}
									</RoutingRuleSelect>
								</Field>
							</div>

							<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
								<div className="grid min-w-0 gap-2">
									<Field>
										<FieldLabel htmlFor="rule-value">
											{t("routing.matchValue")}
										</FieldLabel>
										<HintTooltip label={t("routing.matchAllHint")}>
											<Button
												type="button"
												aria-label={t("routing.matchAllHint")}
												variant="ghost"
												size="icon"
											>
												<Info data-icon="inline-start" />
											</Button>
										</HintTooltip>
									</Field>
									<Input
										id="rule-value"
										required
										value={form.matchValue}
										placeholder={t("routing.matchAllPlaceholder")}
										onChange={(e) =>
											setForm({ ...form, matchValue: e.target.value })
										}
									/>
								</div>
								<div className="grid min-w-0 gap-2">
									<Field>
										<FieldLabel htmlFor="rule-priority">
											{t("routing.priority")}
										</FieldLabel>
										<HintTooltip label={t("routing.priorityHint")}>
											<Button
												type="button"
												aria-label={t("routing.priorityHint")}
												variant="ghost"
												size="icon"
											>
												<Info data-icon="inline-start" />
											</Button>
										</HintTooltip>
									</Field>
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
								</div>
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
												setForm({ ...form, mailboxId: e.target.value || null })
											}
										>
											<option value="">{t("routing.selectMailbox")}</option>
											{mailboxes.map((mailbox) => (
												<option key={mailbox.id} value={mailbox.id}>
													{mailbox.localPart}@{hostname}
													{mailbox.disabled ? t("routing.disabledSuffix") : ""}
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
								<div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
									<div>
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium">
												{t("routing.keepCopy")}
											</p>
											<HintTooltip label={t("routing.keepCopyHint")}>
												<Button
													type="button"
													aria-label={t("routing.keepCopyHint")}
													variant="ghost"
													size="icon"
												>
													<Info data-icon="inline-start" />
												</Button>
											</HintTooltip>
										</div>
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

							<div className="flex justify-end gap-2 border-t border-border pt-4">
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
		</div>
	);
}
function RuleSection({
	className,
	title,
	description,
	rules,
	hostname,
	mailboxes,
	onEdit,
	onDelete,
	onToggle,
}: {
	className: string;
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
		<Card className={className}>
			<CardHeader>
				<div className="flex items-center gap-2">
					<CardTitle className="text-xs uppercase">{title}</CardTitle>
					<HintTooltip label={description}>
						<Button
							type="button"
							aria-label={description}
							variant="ghost"
							size="icon"
						>
							<Info data-icon="inline-start" />
						</Button>
					</HintTooltip>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-2 pb-5">
				{rules.length === 0 ? (
					<Empty>
						<EmptyDescription>{t("routing.noRules")}</EmptyDescription>
					</Empty>
				) : (
					rules.map((rule) => {
						const Icon = ACTION_ICONS[rule.action];
						const ruleName =
							rule.name || describeRule(rule, mailboxes, hostname, t);
						return (
							<Item
								key={rule.id}
								className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2"
							>
								<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<p className="truncate text-sm font-medium">{ruleName}</p>
										{!rule.enabled && (
											<Badge variant="secondary">{t("routing.disabled")}</Badge>
										)}
									</div>
									{rule.name && (
										<p className="truncate text-xs text-muted-foreground">
											{describeRule(rule, mailboxes, hostname, t)}
										</p>
									)}
									<p className="text-xs text-muted-foreground">
										{t("routing.stats", {
											priority: rule.priority,
											count: rule.matchCount,
											last: formatLastMatched(rule.lastMatchedAt, t),
										})}
									</p>
								</div>
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
							</Item>
						);
					})
				)}
			</CardContent>
		</Card>
	);
}
