import type {
	AgentModelOption,
	AgentModelRates,
	AgentProviderKind,
	AgentProviderPreset,
	AgentProviderPublicConfig,
} from "@/lib/agent/provider-types";

export type AgentAdminConfig = AgentProviderPublicConfig;
export interface AgentAdminSettingsResponse {
	config: AgentAdminConfig;
	assistantEnabled: boolean;
	cloudflareAvailable: boolean;
	error?: string;
}
export interface AgentEnabledResponse {
	assistantEnabled: boolean;
	error?: string;
}
export interface AgentAdminModelsResponse {
	models: AgentModelOption[];
	source: "catalog" | "suggested";
	error?: string;
}
export interface AgentAdminForm {
	provider: AgentProviderKind;
	preset: AgentProviderPreset;
	baseUrl: string;
	apiKey: string;
	model: string;
	rates: Record<string, AgentModelRates>;
}
