import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

import { parseAgentModelIds } from "./model-ids";
import { parseAgentModelRates } from "./pricing";
import {
	AGENT_SETTINGS_ID,
	DEFAULT_CLOUDFLARE_MODEL,
	PROVIDER_BASE_URLS,
} from "./provider-constants";
import type {
	AgentProviderConfig,
	AgentProviderPreset,
	AgentProviderPublicConfig,
} from "./provider-types";

export function resolveAgentBaseUrl(
	preset: AgentProviderPreset,
	customUrl: string
) {
	if (preset !== "custom") {
		return PROVIDER_BASE_URLS[preset];
	}
	const url = new URL(customUrl.trim());
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"Custom provider URL must be an HTTPS base URL without credentials or query parameters"
		);
	}
	return url.toString().replace(/\/$/u, "");
}

export async function getAgentEnabled(env: CloudflareEnv): Promise<boolean> {
	const [saved] = await getDb(env)
		.select({ enabled: appSettings.agentEnabled })
		.from(appSettings)
		.where(eq(appSettings.id, AGENT_SETTINGS_ID))
		.limit(1);
	return saved?.enabled ?? true;
}

export async function getAgentProviderConfig(
	env: CloudflareEnv
): Promise<AgentProviderConfig> {
	const [saved] = await getDb(env)
		.select({
			apiKey: appSettings.agentApiKey,
			baseUrl: appSettings.agentBaseUrl,
			model: appSettings.agentModel,
			preset: appSettings.agentPreset,
			provider: appSettings.agentProvider,
			rates: appSettings.agentModelRates,
		})
		.from(appSettings)
		.where(eq(appSettings.id, AGENT_SETTINGS_ID))
		.limit(1);
	const rates = parseAgentModelRates(saved?.rates ?? null);
	if (saved?.provider === "cloudflare") {
		const models = parseAgentModelIds(
			saved.model || env.AI_MODEL || DEFAULT_CLOUDFLARE_MODEL
		);
		return {
			apiKey: "",
			baseUrl: "",
			model: models[0] || DEFAULT_CLOUDFLARE_MODEL,
			models,
			preset: "openai",
			provider: "cloudflare",
			rates,
			source: "saved",
		};
	}
	if (saved?.provider === "compatible") {
		const preset = saved.preset || "custom";
		const baseUrl = resolveAgentBaseUrl(preset, saved.baseUrl || "");
		const models = parseAgentModelIds(saved.model || "");
		return {
			apiKey:
				saved.apiKey ||
				(env.AI_BASE_URL === baseUrl ? env.AI_API_KEY : "") ||
				"",
			baseUrl,
			model: models[0] || "",
			models,
			preset,
			provider: "compatible",
			rates,
			source: "saved",
		};
	}
	const resolveEnvironmentProvider = (): AgentProviderConfig => {
		if (env.AI) {
			const model = env.AI_MODEL || DEFAULT_CLOUDFLARE_MODEL;
			return {
				apiKey: "",
				baseUrl: "",
				model,
				models: [model],
				preset: "openai",
				provider: "cloudflare",
				rates,
				source: "environment",
			};
		}
		if (env.AI_BASE_URL && env.AI_API_KEY) {
			const model = env.AI_MODEL || "gpt-4o-mini";
			return {
				apiKey: env.AI_API_KEY,
				baseUrl: env.AI_BASE_URL,
				model,
				models: [model],
				preset: "custom",
				provider: "compatible",
				rates,
				source: "environment",
			};
		}
		return {
			apiKey: "",
			baseUrl: "",
			model: DEFAULT_CLOUDFLARE_MODEL,
			models: [DEFAULT_CLOUDFLARE_MODEL],
			preset: "openai",
			provider: "cloudflare",
			rates,
			source: "default",
		};
	};
	return resolveEnvironmentProvider();
}

export async function getAgentProviderPublicConfig(
	env: CloudflareEnv
): Promise<AgentProviderPublicConfig> {
	const { apiKey, ...config } = await getAgentProviderConfig(env);
	return {
		...config,
		configured:
			config.provider === "cloudflare"
				? !!env.AI && config.models.length > 0
				: !!apiKey && !!config.baseUrl && config.models.length > 0,
		hasApiKey: !!apiKey,
	};
}
