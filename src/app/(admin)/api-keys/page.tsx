"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { SectionRowSkeleton } from "@/components/page-skeletons";
import { McpAgentInstructions } from "@/components/settings/mcp-agent-instructions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
} from "@/components/ui/empty";
import {
	Field,
	FieldLabel,
	FieldSet,
	FieldLegend,
	FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ItemGroup as List, Item as ListRow } from "@/components/ui/item";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import type { AdminApiKeyScope } from "@/lib/api/scopes-types";
import { authFetch } from "@/lib/auth/client";

import {
	AdminFormPanel as Dialog,
	AdminFormPanelContent as DialogContent,
	AdminFormPanelDescription as DialogDescription,
	AdminFormPanelHeader as DialogHeader,
	AdminFormPanelTitle as DialogTitle,
	AdminFormPanelTrigger as DialogTrigger,
} from "../admin-form-panel";
import { AdminRowActions } from "../admin-row-actions";
import type { ApiKey } from "./types";
import { ADMIN_KEY_PERMISSIONS, parseApiKeyScopes } from "./utils";

export default function ApiKeysPage() {
	const { t } = useLanguage();
	const qc = useQueryClient();
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<AdminApiKeyScope[]>(["domains"]);
	const [mcpAllowed, setMcpAllowed] = useState(false);
	const [createdMcpAllowed, setCreatedMcpAllowed] = useState(false);
	const [newKey, setNewKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);

	const { data, isLoading } = useQuery({
		queryFn: async () => {
			const res = await authFetch("/api/admin/api-keys");
			if (!res.ok) {
				throw new Error(t("adminKeys.loadFailed"));
			}
			return (await res.json()) as { apiKeys: ApiKey[] };
		},
		queryKey: ["admin-api-keys"],
	});

	const create = useMutation({
		mutationFn: async () => {
			const res = await authFetch("/api/admin/api-keys", {
				body: JSON.stringify({ mcpAllowed, name: name.trim(), scopes }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const json = (await res.json()) as { key?: string; error?: string };
			if (!res.ok || !json.key) {
				throw new Error(
					typeof json.error === "string"
						? json.error
						: t("apiKeys.createFailed")
				);
			}
			setNewKey(json.key ?? null);
			setCreatedMcpAllowed(mcpAllowed);
			setCopied(false);
			setName("");
		},
		onSuccess: () => {
			setScopes(["domains"]);
			qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
		},
	});
	const revoke = useMutation({
		mutationFn: async (id: string) => {
			const res = await authFetch(
				`/api/admin/api-keys?id=${encodeURIComponent(id)}`,
				{ method: "DELETE" }
			);
			if (!res.ok) {
				throw new Error(t("adminKeys.revokeFailed"));
			}
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-api-keys"] }),
	});

	return (
		<div className="flex flex-col gap-6">
			<PageHeader className="items-center">
				<PageHeaderText>
					<PageTitle>{t("admin.section.apiKeysTitle")}</PageTitle>
				</PageHeaderText>
				<Dialog
					open={createOpen}
					onOpenChange={(open) => {
						if (create.isPending) {
							return;
						}
						setCreateOpen(open);
						if (!open) {
							setNewKey(null);
							setCopied(false);
						}
					}}
				>
					<DialogTrigger asChild>
						<Button float="mobile">
							<Plus data-icon="inline-start" />
							{t("apiKeys.new")}
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								{newKey ? t("apiKeys.createdTitle") : t("apiKeys.createTitle")}
							</DialogTitle>
							<DialogDescription>
								{newKey ? t("apiKeys.copyNow") : t("apiKeys.nameAndAccess")}
							</DialogDescription>
						</DialogHeader>
						{!newKey && (
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="admin-key-name">
										{t("apiKeys.keyName")}
									</FieldLabel>
									<Input
										id="admin-key-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										maxLength={100}
										placeholder={t("adminKeys.namePlaceholder")}
									/>
								</Field>
								<label className="flex items-start gap-3 text-sm">
									<Checkbox
										checked={mcpAllowed}
										onCheckedChange={(checked) =>
											setMcpAllowed(checked === true)
										}
									/>
									<span>
										<strong>{t("apiKeys.allowMcp")}</strong>
										<span className="mt-1 block text-muted-foreground">
											{t("adminKeys.allowMcpHint")}
										</span>
									</span>
								</label>
								<FieldSet>
									<FieldLegend variant="label">
										{t("apiKeys.permissions")}
									</FieldLegend>
									<div className="flex flex-col gap-2">
										{ADMIN_KEY_PERMISSIONS.map((scope) => (
											<label
												key={scope.value}
												className="flex items-start gap-3 text-sm"
											>
												<Checkbox
													checked={scopes.includes(scope.value)}
													className="mt-1"
													onCheckedChange={(checked) =>
														setScopes((current) =>
															checked === true
																? [...current, scope.value]
																: current.filter((item) => item !== scope.value)
														)
													}
												/>
												<span>
													<strong>{t(scope.labelKey)}</strong>
													<span className="block text-muted-foreground">
														{t(scope.descriptionKey)}
													</span>
												</span>
											</label>
										))}
									</div>
								</FieldSet>
								{create.isError && (
									<p role="alert" className="text-sm text-destructive">
										{(create.error as Error).message}
									</p>
								)}
								<Button
									onClick={() => create.mutate()}
									disabled={
										!name.trim() || scopes.length === 0 || create.isPending
									}
								>
									{create.isPending
										? t("accounts.creating")
										: t("adminKeys.createKey")}
								</Button>
							</FieldGroup>
						)}
						{newKey && (
							<div className="flex flex-col gap-3 rounded-lg border border-signal/30 bg-signal-soft p-4">
								<code className="block rounded-md bg-card p-2 text-xs break-all">
									{newKey}
								</code>
								{createdMcpAllowed && (
									<McpAgentInstructions mode="admin" apiKey={newKey} />
								)}
								<div className="flex gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() =>
											navigator.clipboard
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
					</DialogContent>
				</Dialog>
			</PageHeader>
			<section className="flex flex-col gap-3">
				{revoke.isError && (
					<p role="alert" className="text-sm text-destructive">
						{revoke.error.message}
					</p>
				)}
				{isLoading && <SectionRowSkeleton />}
				{!isLoading && (data?.apiKeys ?? []).length === 0 && (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<KeyRound />
							</EmptyMedia>
							<EmptyDescription>{t("apiKeys.none")}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
				<List className="gap-2">
					{(data?.apiKeys ?? []).map((key) => (
						<ListRow variant="outline" key={key.id} className="">
							<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
								<KeyRound className="size-5" />
							</span>
							<span className="flex min-w-0 flex-1 flex-col gap-2">
								<span className="flex min-w-0 flex-wrap items-center gap-2">
									<strong className="truncate text-sm font-semibold text-foreground">
										{key.name}
									</strong>
									{key.kind === "mcp" && <Badge variant="outline">MCP</Badge>}
								</span>
								<span className="block truncate font-sans text-sm text-muted-foreground">
									{key.prefix}...
								</span>
								<span className="flex flex-wrap gap-1">
									{parseApiKeyScopes(key.scopes).map((scope) => (
										<Badge key={scope} variant="outline">
											{scope}
										</Badge>
									))}
								</span>
							</span>
							<AdminRowActions
								title={t("common.revoke")}
								description={t("apiKeys.revokeConfirm", { name: key.name })}
								confirmLabel={t("common.revoke")}
								onConfirm={() => revoke.mutateAsync(key.id)}
								disabled={revoke.isPending}
							/>
						</ListRow>
					))}
				</List>
			</section>
		</div>
	);
}
