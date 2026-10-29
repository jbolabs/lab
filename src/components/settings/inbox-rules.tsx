"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, Plus, ShieldAlert, Trash2 } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";

import { RoutingRuleSelect } from "./domain-routing/routing-rule-select";
import type { InboxRule, InboxRuleInput } from "./inbox-rules-types";
import {
	createInboxRule,
	deleteInboxRule,
	fetchInboxRules,
	fetchRuleFolders,
	getInboxRuleDestination,
	getRuleFieldLabel,
	getRuleOperatorLabel,
	updateInboxRule,
} from "./inbox-rules-utils";
import { useSettingsConfirm } from "./settings-confirm";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./settings-dialog";
import { SettingsRowActions } from "./settings-row-actions";

function RuleActionIcon({ action }: { action: string }) {
	if (action === "spam") {
		return <ShieldAlert className="size-4" />;
	}
	if (action === "trash") {
		return <Trash2 className="size-4" />;
	}
	return <Folder className="size-4" />;
}
export function InboxRules() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useSettingsConfirm();
	const queryClient = useQueryClient();
	const { selectedMailbox } = useSelectedMailbox();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingRule, setEditingRule] = useState<InboxRule | null>(null);
	const [matchField, setMatchField] = useState<"email" | "content" | "title">(
		"email"
	);
	const [matchOperator, setMatchOperator] = useState<"contains" | "exact">(
		"contains"
	);
	const [matchValue, setMatchValue] = useState("");
	const [destination, setDestination] = useState("");
	const mailboxId = selectedMailbox?.id ?? "";
	const folders = useQuery({
		enabled: !!mailboxId,
		queryFn: () => fetchRuleFolders(mailboxId),
		queryKey: ["folders", mailboxId],
	});
	const rules = useQuery({
		enabled: !!mailboxId,
		queryFn: () => fetchInboxRules(mailboxId),
		queryKey: ["routing-rules", mailboxId],
	});
	const save = useMutation({
		mutationFn: () => {
			const input: InboxRuleInput = {
				destination,
				mailboxId,
				matchField,
				matchOperator,
				matchValue,
				priority: editingRule?.priority ?? 10,
			};
			return editingRule
				? updateInboxRule(editingRule.id, input)
				: createInboxRule(input);
		},
		onSuccess: () => {
			setDialogOpen(false);
			setEditingRule(null);
			queryClient.invalidateQueries({ queryKey: ["routing-rules", mailboxId] });
		},
	});
	const remove = useMutation({
		mutationFn: deleteInboxRule,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["routing-rules", mailboxId] }),
	});
	const folderMap = new Map(
		(folders.data?.folders ?? []).map((folder) => [folder.id, folder.name])
	);
	function getRuleDestinationLabel(
		rule: Pick<InboxRule, "action" | "folderId">
	) {
		if (rule.action === "spam") {
			return t("navigation.spam");
		}
		if (rule.action === "trash") {
			return t("navigation.trash");
		}
		return folderMap.get(rule.folderId ?? "") ?? t("rules.unknownFolder");
	}
	function openCreateDialog() {
		setEditingRule(null);
		setMatchField("email");
		setMatchOperator("contains");
		setMatchValue("");
		setDestination("");
		save.reset();
		setDialogOpen(true);
	}
	function openEditDialog(rule: InboxRule) {
		setEditingRule(rule);
		setMatchField(rule.matchField);
		setMatchOperator(rule.matchOperator);
		setMatchValue(rule.matchValue || rule.pattern);
		setDestination(getInboxRuleDestination(rule));
		save.reset();
		setDialogOpen(true);
	}
	function onRuleKeyDown(
		event: KeyboardEvent<HTMLDivElement>,
		rule: InboxRule
	) {
		// Only the row itself: keys pressed on its action menu trigger belong to the menu.
		if (
			event.target !== event.currentTarget ||
			(event.key !== "Enter" && event.key !== " ")
		) {
			return;
		}
		event.preventDefault();
		openEditDialog(rule);
	}
	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		save.mutate();
	}
	function submitLabel() {
		if (save.isPending) {
			return t("common.saving");
		}
		if (editingRule) {
			return t("rules.saveChanges");
		}
		return t("rules.create");
	}

	return (
		<Card>
			{confirmation}
			<CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1.5">
					<CardTitle>{t("rules.mailboxTitle")}</CardTitle>
					<CardDescription>{t("rules.appliedAfterDelivery")}</CardDescription>
				</div>
				<Button type="button" onClick={openCreateDialog} disabled={!mailboxId}>
					<Plus data-icon="inline-start" />
					{t("rules.new")}
				</Button>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{(rules.data?.rules ?? []).length === 0 && (
					<Empty>
						<EmptyDescription>{t("rules.none")}</EmptyDescription>
					</Empty>
				)}
				{(rules.data?.rules ?? []).map((rule) => (
					<Item
						key={rule.id}
						variant="outline"
						size="sm"
						// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Independent nested controls preclude a native button wrapper.
						role="button"
						tabIndex={0}
						onClick={() => openEditDialog(rule)}
						onKeyDown={(event) => onRuleKeyDown(event, rule)}
						className="cursor-pointer"
					>
						<ItemMedia variant="icon">
							<RuleActionIcon action={rule.action} />
						</ItemMedia>
						<ItemContent className="min-w-0">
							<p className="truncate text-sm font-medium text-foreground">
								{getRuleFieldLabel(rule.matchField, t)}{" "}
								{getRuleOperatorLabel(rule.matchOperator, t)}{" "}
								{rule.matchValue || rule.pattern}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{getRuleDestinationLabel(rule)}
							</p>
						</ItemContent>
						<SettingsRowActions>
							<DropdownMenuItem
								disabled={remove.isPending}
								onClick={(event) => {
									event.stopPropagation();
									void confirm(t("rules.delete")).then((allowed) => {
										if (allowed) {
											remove.mutate(rule.id);
										}

										return null;
									});
								}}
								aria-label={t("rules.delete")}
							>
								<Trash2 data-icon="inline-start" />
								{t("rules.delete")}
							</DropdownMenuItem>
						</SettingsRowActions>
					</Item>
				))}
			</CardContent>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-h-[calc(100dvh_-_4rem)] overflow-y-auto sm:max-w-140">
					<DialogHeader>
						<DialogTitle>
							{editingRule ? t("rules.update") : t("rules.new")}
						</DialogTitle>
						<DialogDescription>
							{t("rules.dialogDescription")}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={onSubmit}>
						<FieldGroup>
							<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="matchField">
										{t("rules.fieldLabel")}
									</FieldLabel>
									<RoutingRuleSelect
										id="matchField"
										value={matchField}
										onChange={(event) =>
											setMatchField(
												event.target.value as "email" | "content" | "title"
											)
										}
									>
										<option value="email">{t("rules.field.email")}</option>
										<option value="content">{t("rules.field.content")}</option>
										<option value="title">{t("rules.field.title")}</option>
									</RoutingRuleSelect>
								</Field>
								<Field>
									<FieldLabel htmlFor="matchOperator">
										{t("rules.matchLabel")}
									</FieldLabel>
									<RoutingRuleSelect
										id="matchOperator"
										value={matchOperator}
										onChange={(event) =>
											setMatchOperator(
												event.target.value as "contains" | "exact"
											)
										}
									>
										<option value="contains">
											{t("rules.operatorOption.contains")}
										</option>
										<option value="exact">
											{t("rules.operatorOption.exact")}
										</option>
									</RoutingRuleSelect>
								</Field>
							</div>
							<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="matchValue">
										{t("rules.valueLabel")}
									</FieldLabel>
									<Input
										id="matchValue"
										value={matchValue}
										onChange={(event) => setMatchValue(event.target.value)}
										placeholder={
											matchField === "email"
												? t("rules.valuePlaceholderEmail")
												: t("rules.valuePlaceholderOther")
										}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="destination">
										{t("rules.destination")}
									</FieldLabel>
									<RoutingRuleSelect
										id="destination"
										value={destination}
										onChange={(event) => setDestination(event.target.value)}
									>
										<option value="">{t("rules.selectDestination")}</option>
										<option value="spam">{t("navigation.spam")}</option>
										<option value="trash">{t("navigation.trash")}</option>
										{(folders.data?.folders ?? []).map((folder) => (
											<option key={folder.id} value={`folder:${folder.id}`}>
												{folder.name}
											</option>
										))}
									</RoutingRuleSelect>
								</Field>
							</div>
							{save.isError && (
								<Alert variant="destructive">
									<AlertDescription>{save.error.message}</AlertDescription>
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
								<Button
									type="submit"
									disabled={
										!mailboxId ||
										!destination ||
										!matchValue.trim() ||
										save.isPending
									}
								>
									{submitLabel()}
								</Button>
							</div>
						</FieldGroup>
					</form>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
