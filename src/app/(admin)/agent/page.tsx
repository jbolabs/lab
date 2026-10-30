"use client";
import { Bot } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { saveAssistantAvailability } from "@/lib/agent/availability-client";
import { parseAgentModelIds, toggleAgentModelId } from "@/lib/agent/model-ids";
import { DEFAULT_CLOUDFLARE_MODEL } from "@/lib/agent/provider-constants";
import type {
	AgentModelOption,
	AgentProviderPreset,
} from "@/lib/agent/provider-types";
import { runAsyncAction } from "@/lib/async-cleanup";

import type { AgentAdminForm } from "./types";
import {
	baseUrlForPreset,
	loadAgentAdminSettings,
	loadAgentModels,
	PROVIDER_PRESETS,
	saveAgentAdminSettings,
	saveAgentEnabled,
	updateAgentModelRate,
} from "./utils";

const initialForm: AgentAdminForm = {
	apiKey: "",
	baseUrl: "",
	model: DEFAULT_CLOUDFLARE_MODEL,
	preset: "openai",
	provider: "cloudflare",
	rates: {},
};

export default function AdminAgentPage() {
	const { t } = useLanguage();
	const [form, setForm] = useState<AgentAdminForm>(initialForm);
	const [assistantEnabled, setAssistantEnabled] = useState(true);
	const [enabledSaving, setEnabledSaving] = useState(false);
	const [enabledStatus, setEnabledStatus] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [cloudflareAvailable, setCloudflareAvailable] = useState(false);
	const [hasSavedKey, setHasSavedKey] = useState(false);
	const [savedEndpoint, setSavedEndpoint] = useState("");
	const [models, setModels] = useState<AgentModelOption[]>([]);
	const [modelSource, setModelSource] = useState<
		"catalog" | "suggested" | null
	>(null);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelError, setModelError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const data = await loadAgentAdminSettings();
				if (!active) {
					return;
				}
				setForm({
					apiKey: "",
					baseUrl: data.config.baseUrl,
					model: data.config.models.join(", "),
					preset: data.config.preset,
					provider: data.config.provider,
					rates: data.config.rates,
				});
				setAssistantEnabled(data.assistantEnabled);
				setCloudflareAvailable(data.cloudflareAvailable);
				setHasSavedKey(data.config.hasApiKey);
				setSavedEndpoint(`${data.config.preset}|${data.config.baseUrl}`);
				setLoaded(true);
			},
			(failure) => {
				if (active) {
					setStatus(
						failure instanceof Error
							? failure.message
							: t("agentAdmin.loadFailed")
					);
				}
			}
		);
		return () => {
			active = false;
		};
	}, [t]);

	const { provider, preset: requestPreset, baseUrl, apiKey } = form;
	const canUseSavedKey =
		hasSavedKey && savedEndpoint === `${form.preset}|${form.baseUrl}`;
	const selectedModelIds = parseAgentModelIds(form.model);
	useEffect(() => {
		if (!loaded) {
			return;
		}
		const controller = new AbortController();
		const timer = window.setTimeout(
			() => {
				setModels([]);
				setModelSource(null);
				setModelError(null);
				setModelsLoading(false);
				if (
					provider === "compatible" &&
					(!baseUrl || (!apiKey.trim() && !canUseSavedKey))
				) {
					setModelError(
						requestPreset === "custom" && !baseUrl
							? t("agentAdmin.enterUrl")
							: t("agentAdmin.enterKey")
					);
					return;
				}
				setModelsLoading(true);
				runAsyncAction(
					async () => {
						const data = await loadAgentModels(
							{
								apiKey,
								baseUrl,
								preset: requestPreset,
								provider,
							},
							controller.signal
						);
						if (controller.signal.aborted) {
							return;
						}
						setModels(data.models);
						setModelSource(data.source);
						const published = Object.fromEntries(
							data.models.flatMap((item) =>
								item.rates ? [[item.id, item.rates]] : []
							)
						);
						if (Object.keys(published).length) {
							setForm((current) => ({
								...current,
								rates: { ...current.rates, ...published },
							}));
						}
					},
					(failure) => {
						if (!controller.signal.aborted) {
							setModelError(
								failure instanceof Error
									? failure.message
									: t("agentAdmin.modelsFailed")
							);
						}
					},
					() => {
						if (!controller.signal.aborted) {
							setModelsLoading(false);
						}
					}
				);
			},
			provider === "cloudflare" ? 0 : 500
		);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [loaded, provider, requestPreset, baseUrl, apiKey, canUseSavedKey, t]);

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		return runAsyncAction(
			async () => {
				const data = await saveAgentAdminSettings(form);
				setForm((current) => ({
					...current,
					apiKey: "",
					model: data.config.models.join(", "),
					rates: data.config.rates,
				}));
				setHasSavedKey(data.config.hasApiKey);
				setSavedEndpoint(`${data.config.preset}|${data.config.baseUrl}`);
				setStatus(t("agentAdmin.saved"));
			},
			(failure) => {
				setStatus(
					failure instanceof Error
						? failure.message
						: t("agentAdmin.saveFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	const missingProviderConfiguration =
		(form.provider === "cloudflare" && !cloudflareAvailable) ||
		(form.provider === "compatible" &&
			(!form.baseUrl || (!form.apiKey.trim() && !canUseSavedKey)));

	const renderProviderSettings = () => (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Bot className="size-5" />
					{t("agentAdmin.provider")}
				</CardTitle>
				<CardDescription>{t("agentAdmin.providerWarning")}</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="agent-provider">
								{t("agentAdmin.providerLabel")}
							</FieldLabel>
							<NativeSelect
								id="agent-provider"
								containerClassName="w-full"
								value={form.provider}
								disabled={!loaded}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										baseUrl:
											event.target.value === "compatible"
												? baseUrlForPreset(current.preset, current.baseUrl)
												: "",
										model:
											event.target.value === "cloudflare"
												? DEFAULT_CLOUDFLARE_MODEL
												: "",
										provider: event.target.value as AgentAdminForm["provider"],
									}))
								}
							>
								<option value="cloudflare">
									{t("agentAdmin.cloudflareAi")}
								</option>
								<option value="compatible">
									{t("agentAdmin.openaiCompatible")}
								</option>
							</NativeSelect>
							{form.provider === "cloudflare" && !cloudflareAvailable && (
								<p className="text-xs text-warning">
									{t("agentAdmin.needsBinding")}
								</p>
							)}
						</Field>
						{form.provider === "compatible" && (
							<>
								<Field>
									<FieldLabel htmlFor="agent-preset">
										{t("agentAdmin.template")}
									</FieldLabel>
									<NativeSelect
										id="agent-preset"
										containerClassName="w-full"
										value={form.preset}
										onChange={(event) => {
											const preset = event.target.value as AgentProviderPreset;
											setForm((current) => ({
												...current,
												apiKey: "",
												baseUrl: baseUrlForPreset(preset),
												model: "",
												preset,
											}));
										}}
									>
										{PROVIDER_PRESETS.map((item) => (
											<option key={item.id} value={item.id}>
												{item.label}
											</option>
										))}
									</NativeSelect>
								</Field>
								<Field>
									<FieldLabel htmlFor="agent-url">
										{t("agentAdmin.baseUrl")}
									</FieldLabel>
									<Input
										id="agent-url"
										type="url"
										value={form.baseUrl}
										readOnly={form.preset !== "custom"}
										placeholder="https://provider.example/v1"
										onChange={(event) =>
											setForm((current) => ({
												...current,
												baseUrl: event.target.value,
												model: "",
											}))
										}
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="agent-key">
										{t("agentAdmin.apiKey")}
									</FieldLabel>
									<Input
										id="agent-key"
										type="password"
										value={form.apiKey}
										autoComplete="new-password"
										placeholder={
											canUseSavedKey
												? t("agentAdmin.savedKeyPlaceholder")
												: t("agentAdmin.enterKeyPlaceholder")
										}
										onChange={(event) =>
											setForm((current) => ({
												...current,
												apiKey: event.target.value,
											}))
										}
									/>
									<FieldDescription>
										{canUseSavedKey
											? t("agentAdmin.keySaved")
											: t("agentAdmin.keyNote")}
									</FieldDescription>
								</Field>
							</>
						)}
						<Field>
							<p className="text-sm font-medium">{t("agentAdmin.models")}</p>
							<div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">
								{modelsLoading && (
									<p className="text-sm text-muted-foreground">
										{t("agentAdmin.loadingModels")}
									</p>
								)}
								{!modelsLoading && !models.length && (
									<p className="text-sm text-muted-foreground">
										{t("agentAdmin.modelsUnavailable")}
									</p>
								)}
								{models.map((item) => (
									<label
										key={item.id}
										className="flex items-start gap-2 text-sm"
									>
										<Checkbox
											checked={selectedModelIds.includes(item.id)}
											onCheckedChange={(checked) =>
												setForm((current) => ({
													...current,
													model: toggleAgentModelId(
														current.model,
														item.id,
														checked === true
													),
												}))
											}
										/>
										<span>
											{item.name === item.id
												? item.id
												: `${item.name} · ${item.id}`}
										</span>
									</label>
								))}
							</div>
							{modelSource === "suggested" && (
								<p className="text-xs text-muted-foreground">
									{t("agentAdmin.suggested")}
								</p>
							)}
							{modelError && (
								<p className="text-xs text-warning">{modelError}</p>
							)}
							<FieldLabel htmlFor="agent-model-id" className="block">
								{t("agentAdmin.orEnterIds")}
							</FieldLabel>
							<Input
								id="agent-model-id"
								value={form.model}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										model: event.target.value,
									}))
								}
								placeholder={
									form.provider === "cloudflare"
										? DEFAULT_CLOUDFLARE_MODEL
										: "provider/model-id, provider/another-model"
								}
								required
							/>
							<FieldDescription>{t("agentAdmin.toolCalling")}</FieldDescription>
						</Field>
						<div className="flex flex-col gap-3">
							<p className="text-sm font-medium">{t("agentAdmin.rates")}</p>
							<p className="text-xs text-muted-foreground">
								{t("agentAdmin.ratesHint")}
							</p>
							{selectedModelIds.map((model) =>
								models.find((item) => item.id === model)?.rates ? (
									<div
										key={model}
										className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
									>
										<span className="min-w-0 break-all">{model}</span>
										<span className="text-muted-foreground">
											{t("agentAdmin.rateLine", {
												input: form.rates[model]?.input,
												output: form.rates[model]?.output,
											})}{" "}
											<span className="text-xs">
												{t("agentAdmin.fromProvider")}
											</span>
										</span>
									</div>
								) : (
									<div
										key={model}
										className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]"
									>
										<span className="min-w-0 text-sm break-all">{model}</span>
										<label className="text-xs text-muted-foreground">
											{t("agentAdmin.input")}{" "}
											<Input
												type="number"
												min="0"
												step="any"
												value={form.rates[model]?.input ?? ""}
												onChange={(event) =>
													setForm((current) =>
														updateAgentModelRate(
															current,
															model,
															"input",
															event.target.value
														)
													)
												}
												placeholder={t("agentAdmin.usdPerM")}
											/>
										</label>
										<label className="text-xs text-muted-foreground">
											{t("agentAdmin.output")}{" "}
											<Input
												type="number"
												min="0"
												step="any"
												value={form.rates[model]?.output ?? ""}
												onChange={(event) =>
													setForm((current) =>
														updateAgentModelRate(
															current,
															model,
															"output",
															event.target.value
														)
													)
												}
												placeholder={t("agentAdmin.usdPerM")}
											/>
										</label>
									</div>
								)
							)}
						</div>
						{status && (
							<output className="text-sm text-foreground/80">{status}</output>
						)}
						<Button
							type="submit"
							disabled={
								!loaded ||
								saving ||
								!selectedModelIds.length ||
								missingProviderConfiguration
							}
						>
							{saving ? t("common.saving") : t("agentAdmin.save")}
						</Button>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("agentAdmin.title")}</PageTitle>
					<PageDescription>{t("agentAdmin.description")}</PageDescription>
				</PageHeaderText>
				<PageHeaderActions>
					<Button
						variant="outline"
						render={<Link href="/ai-usage" />}
						nativeButton={false}
					>
						{t("agentAdmin.viewUsage")}
					</Button>
				</PageHeaderActions>
			</PageHeader>
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<div className="flex flex-col gap-1.5">
							<CardTitle>{t("agentAdmin.enable")}</CardTitle>
							<CardDescription>{t("agentAdmin.enableHint")}</CardDescription>
						</div>
						<Switch
							checked={assistantEnabled}
							disabled={!loaded || enabledSaving}
							onCheckedChange={(checked) => {
								setEnabledSaving(true);
								setEnabledStatus(null);
								runAsyncAction(
									async () => {
										const data = await saveAgentEnabled(checked);
										setAssistantEnabled(data.assistantEnabled);
										saveAssistantAvailability(data.assistantEnabled);
									},
									(failure) =>
										setEnabledStatus(
											failure instanceof Error
												? failure.message
												: t("agentAdmin.availabilityFailed")
										),
									() => setEnabledSaving(false)
								);
							}}
							aria-label={t("agentAdmin.enable")}
						/>
					</div>
				</CardHeader>
				{enabledStatus && (
					<output className="text-sm text-destructive">{enabledStatus}</output>
				)}
			</Card>
			{renderProviderSettings()}
		</div>
	);
}
