import type { ParsedEmail } from "@/lib/email/parse";

export type SpamVerdict = "inbox" | "suspicious" | "spam";

export type SpamClassification = "spam" | "ham";

export interface SpamSignal {
	id: string;
	score: number;
	reason: string;
	metadata?: Record<string, unknown>;
}

export interface SpamIntelligenceProvider {
	check: (input: {
		senderDomain: string;
		urlDomains: string[];
		fingerprint: string;
	}) => Promise<SpamSignal[]>;
}

export interface SpamAnalysisInput {
	mailboxId: string;
	userId: string;
	envelopeFrom: string;
	headers?: Record<string, string>;
	message: ParsedEmail;
	intelligenceProvider?: SpamIntelligenceProvider;
}

export interface SpamAnalysisResult {
	score: number;
	verdict: SpamVerdict;
	signals: SpamSignal[];
	contentProbability?: number;
	fingerprint: string;
}

export interface ReputationKey {
	type: "email" | "domain" | "fingerprint";
	key: string;
}

export interface PreparedSpamContent {
	visibleText: string;
	urlDomains: string[];
}

export interface BayesianResult {
	probability: number;
	contribution: number;
	trainedMessages: number;
	strongestTokens: { token: string; probability: number }[];
}
