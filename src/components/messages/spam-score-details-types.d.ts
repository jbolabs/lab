import type { SpamSignal } from "@/lib/spam/types";

export interface SpamScoreDetailsProps {
	score?: number | null;
	verdict?: "inbox" | "suspicious" | "spam" | null;
	signals?: string | null;
	analysisError?: string | null;
}

export interface ParsedSpamDetails {
	signals: SpamSignal[];
}
