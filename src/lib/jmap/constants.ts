export const CAPABILITY_CORE = "urn:ietf:params:jmap:core";
export const CAPABILITY_MAIL = "urn:ietf:params:jmap:mail";
export const CAPABILITY_SUBMISSION = "urn:ietf:params:jmap:submission";

export const LIMITS = {
	maxCallsInRequest: 32,
	maxObjectsInGet: 200,
	maxObjectsInSet: 100,
	/** Email/query never returns more than this many ids per call. */
	maxQueryLimit: 250,
	maxSizeAttachmentsPerEmail: 20 * 1024 * 1024,
	maxSizeRequest: 10 * 1024 * 1024,
	maxSizeUpload: 10 * 1024 * 1024,
};

export const KEYWORD_SEEN = "$seen";
export const KEYWORD_FLAGGED = "$flagged";
export const KEYWORD_DRAFT = "$draft";
