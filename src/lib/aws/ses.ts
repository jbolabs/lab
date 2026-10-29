import type { AwsConfig, SesIdentityStatus } from "@/lib/aws/aws-types";
import { awsJson, awsQuery, AwsError } from "@/lib/aws/client";
import { xmlBlocks, xmlTag } from "@/lib/aws/xml";

export async function getSesAccount(
	config: AwsConfig
): Promise<{ productionAccess: boolean; sendingEnabled: boolean }> {
	const account = await awsJson<{
		ProductionAccessEnabled?: boolean;
		SendingEnabled?: boolean;
	}>({
		config,
		host: `email.${config.region}.amazonaws.com`,
		path: "/v2/email/account",
		service: "ses",
	});
	return {
		productionAccess: !!account.ProductionAccessEnabled,
		sendingEnabled: account.SendingEnabled !== false,
	};
}

interface SesIdentity {
	VerifiedForSendingStatus?: boolean;
	DkimAttributes?: { Status?: string; Tokens?: string[] };
}

function toIdentityStatus(
	hostname: string,
	identity: SesIdentity | null
): SesIdentityStatus {
	if (!identity) {
		return {
			dkimStatus: "NOT_REGISTERED",
			records: [],
			registered: false,
			verified: false,
		};
	}
	return {
		dkimStatus: identity.DkimAttributes?.Status ?? "NOT_STARTED",
		records: (identity.DkimAttributes?.Tokens ?? []).map((token) => ({
			name: `${token}._domainkey.${hostname}`,
			type: "CNAME" as const,
			value: `${token}.dkim.amazonses.com`,
		})),
		registered: true,
		verified: !!identity.VerifiedForSendingStatus,
	};
}

const sesV2 = (config: AwsConfig, path: string) => ({
	config,
	host: `email.${config.region}.amazonaws.com`,
	path,
	service: "ses",
});

export async function getSesIdentity(
	config: AwsConfig,
	hostname: string
): Promise<SesIdentityStatus> {
	try {
		const identity = await awsJson<SesIdentity>(
			sesV2(config, `/v2/email/identities/${encodeURIComponent(hostname)}`)
		);
		return toIdentityStatus(hostname, identity);
	} catch (error) {
		if (
			error instanceof AwsError &&
			(error.code === "NotFoundException" || error.status === 404)
		) {
			return toIdentityStatus(hostname, null);
		}
		throw error;
	}
}

export async function createSesIdentity(
	config: AwsConfig,
	hostname: string
): Promise<SesIdentityStatus> {
	try {
		const identity = await awsJson<SesIdentity>({
			...sesV2(config, "/v2/email/identities"),
			json: {
				DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
				EmailIdentity: hostname,
			},
			method: "POST",
		});
		return toIdentityStatus(hostname, identity);
	} catch (error) {
		if (error instanceof AwsError && error.code === "AlreadyExistsException") {
			return getSesIdentity(config, hostname);
		}
		throw error;
	}
}

export async function deleteSesIdentity(
	config: AwsConfig,
	hostname: string
): Promise<void> {
	try {
		await awsJson({
			...sesV2(config, `/v2/email/identities/${encodeURIComponent(hostname)}`),
			method: "DELETE",
		});
	} catch (error) {
		if (!(error instanceof AwsError && error.status === 404)) {
			throw error;
		}
	}
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x80_00) {
		// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x80_00));
	}
	return btoa(binary);
}

export interface SesSendInput {
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	subject: string;
	html?: string;
	text?: string;
	headers?: Record<string, string>;
	attachments?: {
		filename: string;
		type: string;
		content: ArrayBuffer;
		disposition: "attachment" | "inline";
		contentId?: string | null;
	}[];
}

export async function sendSesEmail(
	config: AwsConfig,
	input: SesSendInput
): Promise<{ messageId: string }> {
	const headers = Object.entries(input.headers ?? {})
		.filter(([name]) => name.toLowerCase() !== "message-id")
		.map(([Name, Value]) => ({ Name, Value }));
	const result = await awsJson<{ MessageId: string }>({
		...sesV2(config, "/v2/email/outbound-emails"),
		json: {
			Content: {
				Simple: {
					Body: {
						...(input.text
							? // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Retain the SES provider MIME charset value on the wire.
								{ Text: { Charset: "UTF-8", Data: input.text } }
							: {}),
						...(input.html
							? // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Retain the SES provider MIME charset value on the wire.
								{ Html: { Charset: "UTF-8", Data: input.html } }
							: {}),
					},
					// oxlint-disable-next-line unicorn/text-encoding-identifier-case -- Retain the SES provider MIME charset value on the wire.
					Subject: { Charset: "UTF-8", Data: input.subject },
					...(headers.length ? { Headers: headers } : {}),
					...(input.attachments?.length
						? {
								Attachments: input.attachments.map((attachment) => ({
									ContentDisposition:
										attachment.disposition === "inline"
											? "INLINE"
											: "ATTACHMENT",

									ContentTransferEncoding: "BASE64",

									ContentType: attachment.type,

									FileName: attachment.filename,

									...(attachment.disposition === "inline" &&
									attachment.contentId
										? { ContentId: attachment.contentId }
										: {}),

									RawContent: toBase64(attachment.content),
								})),
							}
						: {}),
				},
			},
			Destination: {
				ToAddresses: input.to,
				...(input.cc?.length ? { CcAddresses: input.cc } : {}),
				...(input.bcc?.length ? { BccAddresses: input.bcc } : {}),
			},
			FromEmailAddress: input.from,
		},
		method: "POST",
	});
	// SES rewrites Message-ID to <id@email.amazonses.com> (us-east-1) or <id@region.amazonses.com>.
	const domain =
		config.region === "us-east-1"
			? "email.amazonses.com"
			: `${config.region}.amazonses.com`;
	return { messageId: `<${result.MessageId}@${domain}>` };
}

// --- SES v1 (receipt rules; not available in v2) ---------------------------------

const query = (
	config: AwsConfig,
	action: string,
	params: Record<string, string> = {}
) =>
	awsQuery(config, "email", "2010-12-01", action, params, {
		host: `email.${config.region}.amazonaws.com`,
		signingService: "ses",
	});

export async function describeActiveRuleSet(
	config: AwsConfig
): Promise<{ name: string | null; rules: string[] }> {
	const xml = await query(config, "DescribeActiveReceiptRuleSet");
	const metadata = xmlBlocks(xml, "Metadata")[0] ?? "";
	const rulesXml = xmlBlocks(xml, "Rules")[0] ?? "";
	return {
		name: xmlTag(metadata, "Name"),
		rules: xmlBlocks(rulesXml, "member")
			.map((member) => xmlTag(member, "Name") ?? "")
			.filter(Boolean),
	};
}

export async function createRuleSet(
	config: AwsConfig,
	name: string
): Promise<void> {
	try {
		await query(config, "CreateReceiptRuleSet", { RuleSetName: name });
	} catch (error) {
		if (!(error instanceof AwsError && error.code === "AlreadyExists")) {
			throw error;
		}
	}
}

export async function activateRuleSet(
	config: AwsConfig,
	name: string
): Promise<void> {
	await query(config, "SetActiveReceiptRuleSet", { RuleSetName: name });
}

export interface ReceiptRuleInput {
	ruleSet: string;
	name: string;
	recipient: string;
	bucket: string;
	prefix: string;
	topicArn: string;
}

function ruleParams(input: ReceiptRuleInput): Record<string, string> {
	return {
		"Rule.Actions.member.1.S3Action.BucketName": input.bucket,
		"Rule.Actions.member.1.S3Action.ObjectKeyPrefix": input.prefix,
		"Rule.Actions.member.1.S3Action.TopicArn": input.topicArn,
		"Rule.Enabled": "true",
		"Rule.Name": input.name,
		"Rule.Recipients.member.1": input.recipient,
		"Rule.ScanEnabled": "true",
		"Rule.TlsPolicy": "Optional",
		RuleSetName: input.ruleSet,
	};
}

export async function upsertReceiptRule(
	config: AwsConfig,
	input: ReceiptRuleInput
): Promise<void> {
	try {
		await query(config, "CreateReceiptRule", ruleParams(input));
	} catch (error) {
		if (error instanceof AwsError && error.code === "AlreadyExists") {
			await query(config, "UpdateReceiptRule", ruleParams(input));
		} else {
			throw error;
		}
	}
}

export async function describeReceiptRule(
	config: AwsConfig,
	ruleSet: string,
	name: string
): Promise<boolean> {
	try {
		await query(config, "DescribeReceiptRule", {
			RuleName: name,
			RuleSetName: ruleSet,
		});
		return true;
	} catch (error) {
		if (error instanceof AwsError && /DoesNotExist/u.test(error.code)) {
			return false;
		}
		throw error;
	}
}

export async function deleteReceiptRule(
	config: AwsConfig,
	ruleSet: string,
	name: string
): Promise<void> {
	try {
		await query(config, "DeleteReceiptRule", {
			RuleName: name,
			RuleSetName: ruleSet,
		});
	} catch (error) {
		if (!(error instanceof AwsError && /DoesNotExist/u.test(error.code))) {
			throw error;
		}
	}
}

export { xmlTags } from "@/lib/aws/xml";
