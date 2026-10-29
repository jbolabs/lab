import {
	CAPABILITY_CORE,
	CAPABILITY_MAIL,
	CAPABILITY_SUBMISSION,
	LIMITS,
} from "./constants";
import type { JmapContext } from "./types";

/** The Session object (RFC 8620 §2). One account per API key: the key's user. */
export function buildSession(ctx: JmapContext, sessionState: string) {
	const base = `${ctx.origin}/jmap`;
	return {
		accounts: {
			[ctx.accountId]: {
				accountCapabilities: {
					[CAPABILITY_MAIL]: {
						emailQuerySortOptions: [
							"receivedAt",
							"sentAt",
							"subject",
							"from",
							"size",
							"hasKeyword",
						],
						maxMailboxDepth: 2,
						maxMailboxesPerEmail: 1,
						maxSizeAttachmentsPerEmail: LIMITS.maxSizeAttachmentsPerEmail,
						maxSizeMailboxName: 80,
						mayCreateTopLevelMailbox: false,
					},
					[CAPABILITY_SUBMISSION]: {
						maxDelayedSend: 0,
						submissionExtensions: {},
					},
				},
				isPersonal: true,
				isReadOnly: false,
				name: ctx.auth.email,
			},
		},
		apiUrl: `${base}/api`,
		capabilities: {
			[CAPABILITY_CORE]: {
				collationAlgorithms: ["i;ascii-casemap", "i;unicode-casemap"],
				maxCallsInRequest: LIMITS.maxCallsInRequest,
				maxConcurrentRequests: 4,
				maxConcurrentUpload: 4,
				maxObjectsInGet: LIMITS.maxObjectsInGet,
				maxObjectsInSet: LIMITS.maxObjectsInSet,
				maxSizeRequest: LIMITS.maxSizeRequest,
				maxSizeUpload: LIMITS.maxSizeUpload,
			},
			[CAPABILITY_MAIL]: {},
			[CAPABILITY_SUBMISSION]: {},
		},
		downloadUrl: `${base}/download/{accountId}/{blobId}/{name}?type={type}`,
		eventSourceUrl: `${base}/eventsource?types={types}&closeafter={closeafter}&ping={ping}`,
		primaryAccounts: {
			[CAPABILITY_MAIL]: ctx.accountId,
			[CAPABILITY_SUBMISSION]: ctx.accountId,
		},
		state: sessionState,
		uploadUrl: `${base}/upload/{accountId}`,
		username: ctx.auth.email,
	};
}
