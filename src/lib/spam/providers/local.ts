import type { SpamIntelligenceProvider, SpamSignal } from "../types";

function emptySpamSignals(): Promise<SpamSignal[]> {
	return Promise.resolve([]);
}

export class LocalSpamIntelligenceProvider implements SpamIntelligenceProvider {
	check = emptySpamSignals;
}
