import type { LanguageModelUsage } from "ai";

import type { AgentModelRates } from "@/lib/agent/provider-types";

export interface AiUsageDetails {
	modelId: string;
	provider: string;
	rates: AgentModelRates | undefined;
}
export interface RecordAiUsageInput {
	env: CloudflareEnv;
	details: AiUsageDetails;
	usage: LanguageModelUsage;
	source: string;
}
