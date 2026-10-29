"use client";
import { Item, ItemGroup } from "@/components/ui/item";
import { SettingsRowActions } from "./settings-row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettingsConfirm } from "./settings-confirm";
import {
	FieldLabel,
	Field,
	FieldLegend,
	FieldSet,
	FieldGroup,
} from "@/components/ui/field";
import { mobilePrimaryActionAboveNavClass } from "@/components/page-header-utils";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./settings-dialog";
import { Input } from "@/components/ui/input";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { formatUserDate } from "@/lib/time/utils";
import { McpAgentInstructions } from "@/components/settings/mcp-agent-instructions";
import type { ApiKeyScope } from "@/lib/api/scopes";
import type { ManagedApiKey, McpKeyScope } from "./api-keys-settings-types";
import {
	createManagedApiKey,
	keyPermissions,
	loadManagedApiKeys,
	MCP_KEY_SCOPES,
	revokeManagedApiKey,
	STANDARD_KEY_SCOPES,
} from "./api-keys-settings-utils";
export function ApiKeysSettings() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useSettingsConfirm();
	const { mailboxes, selectedMailbox } = useSelectedMailbox();
	const [keys, setKeys] = useState<ManagedApiKey[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [mcpAllowed, setMcpAllowed] = useState(false);
	const [createdMcpAllowed, setCreatedMcpAllowed] = useState(false);
	const [standardScopes, setStandardScopes] = useState<ApiKeyScope[]>(["read"]);
	const [mcpScopes, setMcpScopes] = useState<McpKeyScope[]>(["mcp:read"]);
	const [mailboxIds, setMailboxIds] = useState<string[]>([]);
	const [newKey, setNewKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const refresh = () =>
			void loadManagedApiKeys()
				.then((items) => {
					if (!cancelled) {
						setKeys(items);
						setError(null);
					}
				})
				.catch((cause) => {
					if (!cancelled)
						setError(
							cause instanceof Error ? cause.message : t("apiKeys.loadFailed"),
						);
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		refresh();
		window.addEventListener("mailflare:api-keys-changed", refresh);
		return () => {
			cancelled = true;
			window.removeEventListener("mailflare:api-keys-changed", refresh);
		};
	}, [t]);
	async function create(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const secret = await createManagedApiKey({
				name: name.trim(),
				mcpAllowed,
				scopes: mcpAllowed ? mcpScopes : standardScopes,
				mailboxIds,
			});
			setNewKey(secret);
			setCreatedMcpAllowed(mcpAllowed);
			setCopied(false);
			setName("");
			setKeys(await loadManagedApiKeys());
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : t("apiKeys.createFailed"),
			);
		} finally {
			setBusy(false);
		}
	}
	async function revoke(key: ManagedApiKey) {
		if (!(await confirm(t("apiKeys.revokeConfirm", { name: key.name }))))
			return;
		setRevokingId(key.id);
		setError(null);
		try {
			await revokeManagedApiKey(key.id);
			setKeys((current) => current.filter((item) => item.id !== key.id));
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : t("apiKeys.revokeFailed"),
			);
		} finally {
			setRevokingId(null);
		}
	}
	return (
		<div className="flex flex-col gap-6">
			{confirmation}
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl md:text-3xl font-medium">
					{t("apiKeys.title")}
				</h1>
				<Dialog
					open={createOpen}
					onOpenChange={(open) => {
						if (busy) return;
						setCreateOpen(open);
						setError(null);
						if (open && mailboxIds.length === 0)
							setMailboxIds(
								[selectedMailbox?.id ?? mailboxes[0]?.id].filter(
									(id): id is string => !!id,
								),
							);
						if (!open) {
							setNewKey(null);
							setCopied(false);
						}
					}}
				>
					<DialogTrigger asChild>
						<Button type="button" className={mobilePrimaryActionAboveNavClass}>
							<Plus data-icon="inline-start" />
							{t("apiKeys.new")}
						</Button>
					</DialogTrigger>
					<DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>
								{newKey ? t("apiKeys.createdTitle") : t("apiKeys.createTitle")}
							</DialogTitle>
							<DialogDescription>
								{newKey ? t("apiKeys.copyNow") : t("apiKeys.nameAndAccess")}
							</DialogDescription>
						</DialogHeader>
						{!newKey && (
							<form
								onSubmit={(event) => void create(event)}
								className="flex flex-col gap-4"
							>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="managed-key-name">
											{t("apiKeys.keyName")}
										</FieldLabel>
										<Input
											id="managed-key-name"
											value={name}
											onChange={(event) => setName(event.target.value)}
											maxLength={100}
											placeholder={t("apiKeys.namePlaceholder")}
										/>
									</Field>
									<Field orientation="horizontal">
										<FieldLabel className="min-h-11 w-full items-center">
											<Checkbox
												checked={mcpAllowed}
												onCheckedChange={(checked) =>
													setMcpAllowed(checked === true)
												}
											/>
											<span>
												<strong>{t("apiKeys.allowMcp")}</strong>
												<span className="mt-1 block text-muted-foreground">
													{t("apiKeys.allowMcpHint")}
												</span>
											</span>
										</FieldLabel>
									</Field>
									<Field orientation="horizontal">
										<FieldLabel className="min-h-11 w-full items-center">
											<Checkbox
												checked={!mcpAllowed && standardScopes.includes("jmap")}
												disabled={mcpAllowed}
												onCheckedChange={(checked) =>
													setStandardScopes((current) =>
														checked === true
															? [...current, "jmap"]
															: current.filter((scope) => scope !== "jmap"),
													)
												}
											/>
											<span>
												<strong>{t("apiKeys.allowJmap")}</strong>
												<span className="mt-1 block text-muted-foreground">
													{mcpAllowed
														? t("apiKeys.jmapNeedsStandard")
														: t("apiKeys.jmapHint")}
												</span>
											</span>
										</FieldLabel>
									</Field>
									<FieldSet>
										<FieldLegend>{t("apiKeys.permissions")}</FieldLegend>
										{(mcpAllowed ? MCP_KEY_SCOPES : STANDARD_KEY_SCOPES).map(
											(scope) => (
												<Field key={scope.value} orientation="horizontal">
													<FieldLabel className="min-h-11 w-full items-center">
														<Checkbox
															checked={
																mcpAllowed
																	? mcpScopes.includes(
																			scope.value as McpKeyScope,
																		)
																	: standardScopes.includes(
																			scope.value as ApiKeyScope,
																		)
															}
															onCheckedChange={(checked) => {
																if (mcpAllowed)
																	setMcpScopes((current) =>
																		checked === true
																			? [...current, scope.value as McpKeyScope]
																			: current.filter(
																					(item) => item !== scope.value,
																				),
																	);
																else
																	setStandardScopes((current) =>
																		checked === true
																			? [...current, scope.value as ApiKeyScope]
																			: current.filter(
																					(item) => item !== scope.value,
																				),
																	);
															}}
														/>
														<span>
															<strong>{t(scope.labelKey)}</strong>
															<span className="block text-muted-foreground">
																{t(scope.descriptionKey)}
															</span>
														</span>
													</FieldLabel>
												</Field>
											),
										)}
									</FieldSet>
									<FieldSet>
										<FieldLegend>{t("apiKeys.allowedMailboxes")}</FieldLegend>
										{mailboxes.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												{t("apiKeys.noMailboxes")}
											</p>
										) : (
											mailboxes.map((mailbox) => (
												<Field key={mailbox.id} orientation="horizontal">
													<FieldLabel className="min-h-11 w-full items-center">
														<Checkbox
															checked={mailboxIds.includes(mailbox.id)}
															onCheckedChange={(checked) =>
																setMailboxIds((current) =>
																	checked === true
																		? [...current, mailbox.id]
																		: current.filter((id) => id !== mailbox.id),
																)
															}
														/>
														{mailbox.localPart}@{mailbox.hostname}
													</FieldLabel>
												</Field>
											))
										)}
										<p className="text-xs text-muted-foreground">
											{t("apiKeys.aliasHint")}
										</p>
									</FieldSet>
									<Button
										type="submit"
										disabled={
											busy ||
											!name.trim() ||
											(!mailboxIds.length &&
												(mcpAllowed
													? mcpScopes.some(
															(scope) => !scope.startsWith("mcp:calendar-"),
														)
													: standardScopes.some(
															(scope) => !scope.startsWith("calendar:"),
														))) ||
											(mcpAllowed ? !mcpScopes.length : !standardScopes.length)
										}
									>
										<KeyRound data-icon="inline-start" />
										{busy ? t("apiKeys.creating") : t("apiKeys.createTitle")}
									</Button>
								</FieldGroup>
							</form>
						)}
						{newKey && (
							<div className="flex flex-col gap-3 rounded-xl border border-signal/30 bg-signal-soft p-4">
								<code className="block break-all rounded bg-card p-2 text-xs">
									{newKey}
								</code>
								{createdMcpAllowed && (
									<McpAgentInstructions mode="mail" apiKey={newKey} />
								)}
								<div className="flex gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() =>
											void navigator.clipboard
												.writeText(newKey)
												.then(() => setCopied(true))
										}
									>
										<Copy data-icon="inline-start" />
										{copied ? t("common.copied") : t("apiKeys.copyKey")}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										disabled={busy}
										onClick={() => {
											setCreateOpen(false);
											setNewKey(null);
											setCopied(false);
										}}
									>
										{t("common.done")}
									</Button>
								</div>
							</div>
						)}
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</DialogContent>
				</Dialog>
			</div>
			<p className="text-sm text-muted-foreground">
				{t("apiKeys.description")}
			</p>
			{error && !createOpen && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<section className="flex flex-col gap-3">
				{loading && <SectionRowSkeleton />}
				{!loading && keys.length === 0 && (
					<Empty>
						<EmptyDescription>{t("apiKeys.none")}</EmptyDescription>
					</Empty>
				)}
				<ItemGroup>
					{keys.map((key) => (
						<Item key={key.id}>
							<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
								<KeyRound className="h-5 w-5" />
							</span>
							<span className="min-w-0 flex-1 flex flex-col gap-2">
								<span className="flex min-w-0 flex-wrap items-center gap-2">
									<strong className="truncate text-sm font-semibold text-foreground">
										{key.name}
									</strong>
									{key.kind === "mcp" && <Badge variant="outline">MCP</Badge>}
								</span>
								<span className="block truncate no-font-mono text-sm text-muted-foreground">
									{key.prefix}… ·{" "}
									{t("apiKeys.createdOn", {
										date: formatUserDate(key.createdAt, { dateStyle: "short" }),
									})}{" "}
									·{" "}
									{key.lastUsedAt
										? t("apiKeys.lastUsed", {
												date: formatUserDate(key.lastUsedAt, {
													dateStyle: "short",
												}),
											})
										: t("apiKeys.neverUsed")}
								</span>
								<span className="flex flex-wrap gap-1">
									{keyPermissions(key).map((scope) => (
										<Badge key={scope} variant="outline">
											{scope}
										</Badge>
									))}
								</span>
								<span className="block text-xs text-muted-foreground">
									{t("apiKeys.mailboxesLabel", {
										list:
											key.mailboxScopeEnabled || key.kind === "mcp"
												? key.mailboxIds
														.map((id) => {
															const mailbox = mailboxes.find(
																(item) => item.id === id,
															);
															return mailbox
																? `${mailbox.localPart}@${mailbox.hostname}`
																: id;
														})
														.join(", ") || t("common.none")
												: t("apiKeys.allAccessible"),
									})}
								</span>
							</span>
							<SettingsRowActions>
								<DropdownMenuItem
									disabled={revokingId === key.id}
									onClick={() => void revoke(key)}
								>
									<Trash2 data-icon="inline-start" />
									{revokingId === key.id
										? t("common.revoking")
										: t("common.revoke")}
								</DropdownMenuItem>
							</SettingsRowActions>
						</Item>
					))}
				</ItemGroup>
			</section>
		</div>
	);
}
