export const SPAM_THRESHOLDS = { spam: 70, suspicious: 40 } as const;

export const SPAM_WEIGHTS = {
	authentication: {
		dkimFail: 8,
		dkimPass: -4,
		dmarcFail: 18,
		dmarcPass: -8,
		spfFail: 6,
		spfPass: -2,
	},
	content: { maximum: 30 },
	relationships: { manuallySavedContact: -15, previouslySentTo: -25 },
	reputation: { establishedHam: -15, establishedSpam: 25 },
} as const;

export const MAX_CANDIDATE_TOKENS = 500;
export const MAX_BAYESIAN_TOKENS = 20;
export const TOKENIZER_VERSION = 1;
