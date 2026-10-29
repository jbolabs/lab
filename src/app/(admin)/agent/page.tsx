"use client";
import { Field, FieldLabel } from "@/components/ui/field";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_CLOUDFLARE_MODEL } from "@/lib/agent/provider-constants";
import { saveAssistantAvailability } from "@/lib/agent/availability-client";
import { parseAgentModelIds, toggleAgentModelId } from "@/lib/agent/model-ids";
import type { AgentModelOption, AgentProviderPreset } from "@/lib/agent/provider-types";
import type { AgentAdminForm } from "./types";
import { baseUrlForPreset, loadAgentAdminSettings, loadAgentModels, PROVIDER_PRESETS, saveAgentAdminSettings, saveAgentEnabled, updateAgentModelRate } from "./utils";

const initialForm: AgentAdminForm = { provider: "cloudflare", preset: "openai", baseUrl: "", apiKey: "", model: DEFAULT_CLOUDFLARE_MODEL, rates: {} };

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
	const [modelSource, setModelSource] = useState<"catalog" | "suggested" | null>(null);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelError, setModelError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let active = true;
		void loadAgentAdminSettings().then((data) => {
			if (!active) return;
			setForm({ provider: data.config.provider, preset: data.config.preset, baseUrl: data.config.baseUrl, apiKey: "", model: data.config.models.join(", "), rates: data.config.rates });
			setAssistantEnabled(data.assistantEnabled);
			setCloudflareAvailable(data.cloudflareAvailable);
			setHasSavedKey(data.config.hasApiKey);
			setSavedEndpoint(`${data.config.preset}|${data.config.baseUrl}`);
			setLoaded(true);
		}).catch((error) => { if (active) setStatus(error instanceof Error ? error.message : t("agentAdmin.loadFailed")); });
		return () => { active = false; };
	}, [t]);

	const canUseSavedKey = hasSavedKey && savedEndpoint === `${form.preset}|${form.baseUrl}`;
	const selectedModelIds = parseAgentModelIds(form.model);
	useEffect(() => {
		if (!loaded) return;
		setModels([]);
		setModelSource(null);
		setModelError(null);
		if (form.provider === "compatible" && (!form.baseUrl || (!form.apiKey.trim() && !canUseSavedKey))) {
			setModelError(form.preset === "custom" && !form.baseUrl ? t("agentAdmin.enterUrl") : t("agentAdmin.enterKey"));
			return;
		}
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			setModelsLoading(true);
			void loadAgentModels(form, controller.signal).then((data) => {
				setModels(data.models);
				setModelSource(data.source);
				const published = Object.fromEntries(data.models.flatMap((item) => item.rates ? [[item.id, item.rates]] : []));
				if (Object.keys(published).length) setForm((current) => ({ ...current, rates: { ...current.rates, ...published } }));
			}).catch((error) => {
				if (!controller.signal.aborted) setModelError(error instanceof Error ? error.message : t("agentAdmin.modelsFailed"));
			}).finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
		}, form.provider === "cloudflare" ? 0 : 500);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [loaded, form.provider, form.preset, form.baseUrl, form.apiKey, canUseSavedKey, t]);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		try {
			const data = await saveAgentAdminSettings(form);
			setForm((current) => ({ ...current, apiKey: "", model: data.config.models.join(", "), rates: data.config.rates }));
			setHasSavedKey(data.config.hasApiKey);
			setSavedEndpoint(`${data.config.preset}|${data.config.baseUrl}`);
			setStatus(t("agentAdmin.saved"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : t("agentAdmin.saveFailed"));
		} finally { setSaving(false); }
	}

	return <div className="flex flex-col gap-6">
		<div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("agentAdmin.title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("agentAdmin.description")}</p></div><Link href="/ai-usage" className="shrink-0 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/60">{t("agentAdmin.viewUsage")}</Link></div>
		<Card className="rounded-lg border-0 bg-card p-6">
			<CardContent className="flex items-center justify-between gap-4 p-0">
				<div><p className="font-medium text-foreground">{t("agentAdmin.enable")}</p><p className="mt-1 text-sm text-muted-foreground">{t("agentAdmin.enableHint")}</p></div>
				<Switch checked={assistantEnabled} disabled={!loaded || enabledSaving} onCheckedChange={(checked) => {
					setEnabledSaving(true);
					setEnabledStatus(null);
					void saveAgentEnabled(checked).then((data) => { setAssistantEnabled(data.assistantEnabled); saveAssistantAvailability(data.assistantEnabled); }).catch((error) => setEnabledStatus(error instanceof Error ? error.message : t("agentAdmin.availabilityFailed"))).finally(() => setEnabledSaving(false));
				}} aria-label={t("agentAdmin.enable")} />
			</CardContent>
			{enabledStatus && <p role="status" className="mt-3 text-sm text-red-700">{enabledStatus}</p>}
		</Card>
		<Card className="rounded-lg border-0 bg-card p-6">
			<CardHeader className="py-0"><CardTitle className="flex items-center gap-2"><Bot className="size-5" />{t("agentAdmin.provider")}</CardTitle><CardDescription>{t("agentAdmin.providerWarning")}</CardDescription></CardHeader>
			<CardContent className="pt-6"><form onSubmit={submit} className="flex flex-col gap-5">
				<Field className="flex flex-col gap-2"><FieldLabel htmlFor="agent-provider">{t("agentAdmin.providerLabel")}</FieldLabel><select id="agent-provider" className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50" value={form.provider} disabled={!loaded} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as AgentAdminForm["provider"], baseUrl: event.target.value === "compatible" ? baseUrlForPreset(current.preset, current.baseUrl) : "", model: event.target.value === "cloudflare" ? DEFAULT_CLOUDFLARE_MODEL : "" }))}><option value="cloudflare">{t("agentAdmin.cloudflareAi")}</option><option value="compatible">{t("agentAdmin.openaiCompatible")}</option></select>{form.provider === "cloudflare" && !cloudflareAvailable && <p className="text-xs text-amber-700">{t("agentAdmin.needsBinding")}</p>}</Field>
				{form.provider === "compatible" && <>
					<Field className="flex flex-col gap-2"><FieldLabel htmlFor="agent-preset">{t("agentAdmin.template")}</FieldLabel><select id="agent-preset" className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50" value={form.preset} onChange={(event) => { const preset = event.target.value as AgentProviderPreset; setForm((current) => ({ ...current, preset, baseUrl: baseUrlForPreset(preset), apiKey: "", model: "" })); }}>{PROVIDER_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
					<Field className="flex flex-col gap-2"><FieldLabel htmlFor="agent-url">{t("agentAdmin.baseUrl")}</FieldLabel><Input id="agent-url" type="url" value={form.baseUrl} readOnly={form.preset !== "custom"} placeholder="https://provider.example/v1" onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value, model: "" }))} required /></Field>
					<Field className="flex flex-col gap-2"><FieldLabel htmlFor="agent-key">{t("agentAdmin.apiKey")}</FieldLabel><Input id="agent-key" type="password" value={form.apiKey} autoComplete="new-password" placeholder={canUseSavedKey ? t("agentAdmin.savedKeyPlaceholder") : t("agentAdmin.enterKeyPlaceholder")} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} /><p className="text-xs text-muted-foreground">{canUseSavedKey ? t("agentAdmin.keySaved") : t("agentAdmin.keyNote")}</p></Field>
				</>}
				<Field className="flex flex-col gap-2"><p className="text-sm font-medium">{t("agentAdmin.models")}</p><div className="max-h-64 flex flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">{modelsLoading && <p className="text-sm text-muted-foreground">{t("agentAdmin.loadingModels")}</p>}{!modelsLoading && !models.length && <p className="text-sm text-muted-foreground">{t("agentAdmin.modelsUnavailable")}</p>}{models.map((item) => <label key={item.id} className="flex items-start gap-2 text-sm"><Checkbox checked={selectedModelIds.includes(item.id)} onCheckedChange={(checked) => setForm((current) => ({ ...current, model: toggleAgentModelId(current.model, item.id, (checked === true)) }))} /><span>{item.name === item.id ? item.id : `${item.name} · ${item.id}`}</span></label>)}</div>{modelSource === "suggested" && <p className="text-xs text-muted-foreground">{t("agentAdmin.suggested")}</p>}{modelError && <p className="text-xs text-amber-700">{modelError}</p>}<FieldLabel htmlFor="agent-model-id" className="block pt-2 text-xs text-muted-foreground">{t("agentAdmin.orEnterIds")}</FieldLabel><Input id="agent-model-id" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder={form.provider === "cloudflare" ? DEFAULT_CLOUDFLARE_MODEL : "provider/model-id, provider/another-model"} required /><p className="text-xs text-muted-foreground">{t("agentAdmin.toolCalling")}</p></Field>
				<div className="flex flex-col gap-3"><p className="text-sm font-medium">{t("agentAdmin.rates")}</p><p className="text-xs text-muted-foreground">{t("agentAdmin.ratesHint")}</p>{selectedModelIds.map((model) => models.find((item) => item.id === model)?.rates ? <div key={model} className="grid gap-2 rounded-xl border border-border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"><span className="min-w-0 break-all">{model}</span><span className="text-muted-foreground">{t("agentAdmin.rateLine", { input: form.rates[model]?.input, output: form.rates[model]?.output })} <span className="text-xs">{t("agentAdmin.fromProvider")}</span></span></div> : <div key={model} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]"><span className="min-w-0 break-all text-sm">{model}</span><label className="text-xs text-muted-foreground">{t("agentAdmin.input")} <Input type="number" min="0" step="any" value={form.rates[model]?.input ?? ""} onChange={(event) => setForm((current) => updateAgentModelRate(current, model, "input", event.target.value))} placeholder={t("agentAdmin.usdPerM")} /></label><label className="text-xs text-muted-foreground">{t("agentAdmin.output")} <Input type="number" min="0" step="any" value={form.rates[model]?.output ?? ""} onChange={(event) => setForm((current) => updateAgentModelRate(current, model, "output", event.target.value))} placeholder={t("agentAdmin.usdPerM")} /></label></div>)}</div>
				{status && <p role="status" className="text-sm text-foreground/80">{status}</p>}
				<Button type="submit" disabled={!loaded || saving || !selectedModelIds.length || (form.provider === "cloudflare" && !cloudflareAvailable) || (form.provider === "compatible" && (!form.baseUrl || (!form.apiKey.trim() && !canUseSavedKey))) }>{saving ? t("common.saving") : t("agentAdmin.save")}</Button>
			</form></CardContent>
		</Card>
	</div>;
}
