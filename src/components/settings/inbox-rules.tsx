"use client";
import { Item, ItemGroup } from "@/components/ui/item";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SettingsRowActions } from "./settings-row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useSettingsConfirm } from "./settings-confirm";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import type { FormEvent, KeyboardEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, } from "./settings-dialog";
import { Input } from "@/components/ui/input";
import { RoutingRuleSelect } from "./domain-routing/routing-rule-select";
import type { InboxRule, InboxRuleInput } from "./inbox-rules-types";
import { createInboxRule, deleteInboxRule, fetchInboxRules, fetchRuleFolders, getInboxRuleDestination, getRuleFieldLabel, getRuleOperatorLabel, updateInboxRule, } from "./inbox-rules-utils";
export function InboxRules() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useSettingsConfirm();
	const queryClient = useQueryClient();
	const { selectedMailbox } = useSelectedMailbox();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingRule, setEditingRule] = useState<InboxRule | null>(null);
	const [matchField, setMatchField] = useState<"email" | "content" | "title">("email");
	const [matchOperator, setMatchOperator] = useState<"contains" | "exact">("contains");
	const [matchValue, setMatchValue] = useState("");
	const [destination, setDestination] = useState("");
	const mailboxId = selectedMailbox?.id ?? "";
	const folders = useQuery({
		queryKey: ["folders", mailboxId],
		enabled: !!mailboxId,
		queryFn: () => fetchRuleFolders(mailboxId),
	});
	const rules = useQuery({
		queryKey: ["routing-rules", mailboxId],
		enabled: !!mailboxId,
		queryFn: () => fetchInboxRules(mailboxId),
	});
	const save = useMutation({
		mutationFn: () => {
			const input: InboxRuleInput = {
				mailboxId,
				matchField,
				matchOperator,
				matchValue,
				destination,
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
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-rules", mailboxId] }),
	});
	const folderMap = new Map((folders.data?.folders ?? []).map((folder) => [folder.id, folder.name]));
	function getRuleDestinationLabel(rule: Pick<InboxRule, "action" | "folderId">) {
		if (rule.action === "spam")
			return t("navigation.spam");
		if (rule.action === "trash")
			return t("navigation.trash");
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
	function onRuleKeyDown(event: KeyboardEvent<HTMLDivElement>, rule: InboxRule) {
		// Only the row itself: keys pressed on its action menu trigger belong to the menu.
		if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " "))
			return;
		event.preventDefault();
		openEditDialog(rule);
	}
	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		save.mutate();
	}
	return (<section className="flex flex-col gap-4">
			{confirmation}
			<div className="flex flex-row items-center">
				<header className="flex-1">
					<h2 className="text-2xl font-semibold text-foreground">
						{t("rules.mailboxTitle")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("rules.appliedAfterDelivery")}
					</p>
				</header>

				<Button type="button" onClick={openCreateDialog} disabled={!mailboxId}>
					<Plus data-icon="inline-start"/>
					{t("rules.new")}
				</Button>
			</div>
			<div className="py-6">
				{(rules.data?.rules ?? []).length === 0 && (<Empty><EmptyDescription>{t("rules.none")}</EmptyDescription></Empty>)}
				<div className="flex flex-col gap-1">
					{(rules.data?.rules ?? []).map((rule) => (<Item key={rule.id} role="button" tabIndex={0} onClick={() => openEditDialog(rule)} onKeyDown={(event) => onRuleKeyDown(event, rule)} className="group flex cursor-pointer items-center gap-3 rounded-xl bg-muted/60 px-3 py-3 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-soft text-signal">
								{rule.action === "spam" ? <ShieldAlert className="size-4" /> : rule.action === "trash" ? <Trash2 className="size-4" /> : <Folder className="size-4" />}
</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-foreground">
									{getRuleFieldLabel(rule.matchField, t)}{" "}
									{getRuleOperatorLabel(rule.matchOperator, t)}{" "}
									{rule.matchValue || rule.pattern}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{getRuleDestinationLabel(rule)}
								</p>
							</div>
							<SettingsRowActions>
								<DropdownMenuItem disabled={remove.isPending} onClick={(event) => {
				event.stopPropagation();
				void confirm(t("rules.delete")).then((allowed) => {
					if (allowed)
						remove.mutate(rule.id);
				});
			}} aria-label={t("rules.delete")}>
									<Trash2 data-icon="inline-start"/>{t("rules.delete")}
								</DropdownMenuItem>
							</SettingsRowActions>
						</Item>))}
				</div>
			</div>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-[560px]">
					<DialogHeader>
						<DialogTitle>
							{editingRule ? t("rules.update") : t("rules.new")}
						</DialogTitle>
						<DialogDescription>
							{t("rules.dialogDescription")}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						<FieldGroup>
							<div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="matchField">
										{t("rules.fieldLabel")}
									</FieldLabel>
									<RoutingRuleSelect id="matchField" value={matchField} onChange={(event) => setMatchField(event.target.value as "email" | "content" | "title")}>
										<option value="email">{t("rules.field.email")}</option>
										<option value="content">{t("rules.field.content")}</option>
										<option value="title">{t("rules.field.title")}</option>
									</RoutingRuleSelect>
								</Field>
								<Field>
									<FieldLabel htmlFor="matchOperator">
										{t("rules.matchLabel")}
									</FieldLabel>
									<RoutingRuleSelect id="matchOperator" value={matchOperator} onChange={(event) => setMatchOperator(event.target.value as "contains" | "exact")}>
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
									<Input id="matchValue" value={matchValue} onChange={(event) => setMatchValue(event.target.value)} placeholder={matchField === "email"
			? t("rules.valuePlaceholderEmail")
			: t("rules.valuePlaceholderOther")}/>
								</Field>
								<Field>
									<FieldLabel htmlFor="destination">
										{t("rules.destination")}
									</FieldLabel>
									<RoutingRuleSelect id="destination" value={destination} onChange={(event) => setDestination(event.target.value)}>
										<option value="">{t("rules.selectDestination")}</option>
										<option value="spam">{t("navigation.spam")}</option>
										<option value="trash">{t("navigation.trash")}</option>
										{(folders.data?.folders ?? []).map((folder) => (<option key={folder.id} value={`folder:${folder.id}`}>
												{folder.name}
											</option>))}
									</RoutingRuleSelect>
								</Field>
							</div>
							{save.isError && (<Alert variant="destructive">
									<AlertDescription>{save.error.message}</AlertDescription>
								</Alert>)}
							<div className="flex justify-end gap-2 border-t border-border pt-4">
								<Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
									{t("common.cancel")}
								</Button>
								<Button type="submit" disabled={!mailboxId ||
			!destination ||
			!matchValue.trim() ||
			save.isPending}>
									{save.isPending
			? t("common.saving")
			: editingRule
				? t("rules.saveChanges")
				: t("rules.create")}
								</Button>
							</div>
						</FieldGroup>
					</form>
				</DialogContent>
			</Dialog>
		</section>);
}
