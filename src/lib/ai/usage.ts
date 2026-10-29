import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";
import { calculateAgentCostUsdMicros } from "@/lib/agent/pricing";
import { newId } from "@/lib/ids";

import type { RecordAiUsageInput } from "./usage-types";

export async function recordAiUsage({
	env,
	details,
	usage,
	source,
}: RecordAiUsageInput) {
	try {
		await getDb(env)
			.insert(aiUsage)
			.values({
				costUsdMicros: calculateAgentCostUsdMicros(usage, details.rates),
				id: newId("usage"),
				inputTokens: usage.inputTokens ?? null,
				model: details.modelId,
				outputTokens: usage.outputTokens ?? null,
				provider: details.provider,
				source,
			});
	} catch (error) {
		console.error("Could not record AI usage", error);
	}
}
