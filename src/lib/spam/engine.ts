import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db";
import { contacts, spamReputation } from "@/db/schema";
import { getEmailAddress } from "@/lib/email/address";

import { analyzeAuthentication } from "./analyzers/authentication";
import { getReputationKeys } from "./analyzers/reputation";
import { analyzeStructure } from "./analyzers/structure";
import { analyzeUrls } from "./analyzers/urls";
import { classifyTokens } from "./classifier";
import { LocalSpamIntelligenceProvider } from "./providers/local";
import {
	buildFingerprint,
	getDomain,
	prepareSpamContent,
	tokenizeMessage,
} from "./tokenizer";
import type {
	SpamAnalysisInput,
	SpamAnalysisResult,
	SpamSignal,
} from "./types";
import { SPAM_THRESHOLDS, SPAM_WEIGHTS } from "./weights";

export async function analyzeSpam(
	db: AppDatabase,
	input: SpamAnalysisInput
): Promise<SpamAnalysisResult> {
	const prepared = prepareSpamContent(input.message);
	const fingerprint = buildFingerprint(input.message, prepared);
	const sender = getEmailAddress(
		input.message.fromAddr ?? input.envelopeFrom
	).toLowerCase();
	const signals: SpamSignal[] = [
		...analyzeAuthentication(input.headers),
		...analyzeUrls(input.message, prepared),
		...analyzeStructure(input.message, input.headers, prepared),
	];
	const intelligenceProvider =
		input.intelligenceProvider ?? new LocalSpamIntelligenceProvider();
	signals.push(
		...(await intelligenceProvider.check({
			fingerprint,
			senderDomain: getDomain(sender),
			urlDomains: prepared.urlDomains,
		}))
	);

	const [contact] = sender
		? await db
				.select()
				.from(contacts)
				.where(
					and(eq(contacts.userId, input.userId), eq(contacts.email, sender))
				)
				.limit(1)
		: [];
	if (contact?.blocked) {
		return {
			fingerprint,
			score: 100,
			signals: [
				{ id: "blocked_sender", reason: "Sender is blocked", score: 100 },
			],
			verdict: "spam",
		};
	}
	if (contact?.source === "manual") {
		signals.push({
			id: "manual_contact",
			reason: "Sender is in your manually saved contacts",
			score: SPAM_WEIGHTS.relationships.manuallySavedContact,
		});
	}
	if (contact?.source === "outbound") {
		signals.push({
			id: "previously_sent",
			reason: "You have previously sent email to this address",
			score: SPAM_WEIGHTS.relationships.previouslySentTo,
		});
	}
	const scoreMessageReputation = async (): Promise<SpamAnalysisResult> => {
		const identities = getReputationKeys(input.message, fingerprint);
		const reputationRecords = await Promise.all(
			identities.map(async (identity) => {
				const [record] = await db
					.select()
					.from(spamReputation)
					.where(
						and(
							eq(spamReputation.mailboxId, input.mailboxId),
							eq(spamReputation.type, identity.type),
							eq(spamReputation.key, identity.key)
						)
					)
					.limit(1);
				return { identity, record };
			})
		);
		const reputationSignals: SpamSignal[] = [];
		for (const { identity, record } of reputationRecords) {
			if (!record || record.spamCount + record.hamCount < 3) {
				continue;
			}
			const spamRatio =
				(record.spamCount + 1) / (record.spamCount + record.hamCount + 2);
			if (spamRatio >= 0.8) {
				reputationSignals.push({
					id: `poor_${identity.type}_reputation`,
					reason: `${identity.type === "fingerprint" ? "Similar messages have" : "This sender has"} repeatedly been marked as spam`,
					score: SPAM_WEIGHTS.reputation.establishedSpam,
				});
			}
			if (spamRatio <= 0.2) {
				reputationSignals.push({
					id: `good_${identity.type}_reputation`,
					reason: `${identity.type === "fingerprint" ? "Similar messages have" : "This sender has"} repeatedly been marked as legitimate`,
					score: SPAM_WEIGHTS.reputation.establishedHam,
				});
			}
		}
		const [strongestReputation] = reputationSignals.toSorted(
			(a, b) => Math.abs(b.score) - Math.abs(a.score)
		);
		if (strongestReputation) {
			signals.push(strongestReputation);
		}

		const bayesian = await classifyTokens(
			db,
			input.mailboxId,
			tokenizeMessage(input.message, prepared)
		);
		if (bayesian.contribution !== 0) {
			signals.push({
				id: bayesian.contribution > 0 ? "bayesian_spam" : "bayesian_ham",
				metadata: {
					probability: Number(bayesian.probability.toFixed(3)),
					trainedMessages: bayesian.trainedMessages,
				},
				reason:
					bayesian.contribution > 0
						? "Content resembles messages previously marked as spam"
						: "Content resembles messages previously marked as legitimate",
				score: bayesian.contribution,
			});
		}

		const rawScore = signals.reduce((total, signal) => total + signal.score, 0);
		const score = Math.max(0, Math.min(100, rawScore));
		if (rawScore !== score) {
			signals.push({
				id: "score_boundary",
				reason:
					rawScore > 100
						? "Score is capped at 100"
						: "Score cannot be lower than 0",
				score: score - rawScore,
			});
		}
		const verdict = (() => {
			if (score >= SPAM_THRESHOLDS.spam) {
				return "spam";
			}
			if (score >= SPAM_THRESHOLDS.suspicious) {
				return "suspicious";
			}
			return "inbox";
		})();
		return {
			contentProbability: bayesian.probability,
			fingerprint,
			score,
			signals: signals.filter(
				(signal) =>
					Math.abs(signal.score) >= 2 || signal.id === "score_boundary"
			),
			verdict,
		};
	};
	return await scoreMessageReputation();
}
