import { z } from "zod";

import { getEmailAddress, splitEmailAddressList } from "@/lib/email/address";
import { compileRulePattern } from "@/lib/email/rule-pattern";
import {
	DEFAULT_FOLDER_COLOR,
	FOLDER_COLOR_VALUES,
} from "@/lib/folders/colors";

/**
 * Recipients arrive either as one comma-separated header string (the composer)
 * or as an array (the public API). Both normalise to a trimmed list of entries
 * that still carry their display names.
 */
const recipientListSchema = z
	.union([
		z.string().max(5000),
		z.array(z.string().trim().min(3).max(500)).max(50),
	])
	.transform((value) =>
		Array.isArray(value) ? value : splitEmailAddressList(value)
	)
	.refine(
		(list) => list.length <= 50,
		"A message can have at most 50 recipients per field"
	)
	.refine(
		(list) => list.every((entry) => getEmailAddress(entry).includes("@")),
		"Enter valid email addresses"
	);

const messageIdListSchema = z
	.union([z.string().max(5000), z.array(z.string().max(998)).max(50)])
	.transform((value) => (Array.isArray(value) ? value.join(" ") : value));

export const sendEmailSchema = z.object({
	attachments: z
		.array(
			z.object({
				contentBase64: z
					.string()
					.min(1)
					.max(14 * 1024 * 1024),
				filename: z.string().min(1).max(255),
				type: z.string().min(1).max(255).default("application/octet-stream"),
			})
		)
		.max(10)
		.optional(),
	bcc: recipientListSchema.optional(),
	cc: recipientListSchema.optional(),
	from: z.string().min(3).max(500),
	html: z
		.string()
		.max(2 * 1024 * 1024)
		.optional(),
	inReplyTo: z.string().max(998).optional(),
	mailboxId: z.string().min(1).max(200),
	references: messageIdListSchema.optional(),
	scheduledAt: z.string().datetime().optional(),
	subject: z.string().min(1).max(500),
	text: z
		.string()
		.max(2 * 1024 * 1024)
		.optional(),
	threadId: z.string().max(998).optional(),
	to: recipientListSchema.refine(
		(list) => list.length > 0,
		"At least one recipient is required"
	),
	undoSend: z.boolean().optional(),
});

export const registerSchema = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	password: z.string().min(8),
});

export const firstRunRegisterSchema = z.object({
	domain: z.string().min(3),
	enableSending: z.boolean().optional(),
	password: z.string().min(8),
	replaceMxRecords: z.boolean().optional(),
	resetEmail: z.string().email(),
	skipDns: z.boolean().optional(),
	username: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._%+-]+$/u),
});

export const primaryDomainRegisterSchema = z.object({
	password: z.string().min(8),
	resetEmail: z.string().email(),
	username: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._%+-]+$/u),
});

export const setupDomainSchema = z.object({
	hostname: z.string().min(3),
});

export const addDomainSchema = z.object({
	enableRouting: z.boolean().optional(),
	enableSending: z.boolean().optional(),
	hostname: z.string().min(3),
	/** Which service receives mail for the domain; Cloudflare Email Routing when omitted. */
	receivingProvider: z.enum(["none", "cloudflare", "resend", "ses"]).optional(),
	replaceMxRecords: z.boolean().optional(),
	/** Which service sends mail for the domain; derived from `enableSending` when omitted. */
	sendingProvider: z.enum(["none", "cloudflare", "resend", "ses"]).optional(),
	/** Record the domain without adding or checking DNS; a warning shows until it is confirmed. */
	skipDns: z.boolean().optional(),
});

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
	email: z.string().trim().email(),
});

export const passwordResetConfirmSchema = z.object({
	password: z.string().min(8).max(128),
	token: z.string().min(8).max(200),
});

/** `/api/auth/device`: either email + password, or a challenge + code after MFA. */
export const deviceLoginSchema = z.union([
	z.object({
		deviceName: z.string().trim().min(1).max(100),
		email: z.string().trim().email(),
		password: z.string().min(1),
	}),
	z.object({
		challengeToken: z.string().min(8).max(200),
		code: z.string().trim().min(6).max(32),
		deviceName: z.string().trim().min(1).max(100),
	}),
]);

export const mfaVerifySchema = z.object({
	challengeToken: z.string().min(8).max(200),
	code: z.string().trim().min(6).max(32),
});

export const mfaEnrollSchema = z.object({
	password: z.string().min(1),
});

export const mfaConfirmSchema = z.object({
	code: z.string().trim().min(6).max(12),
});

export const mfaDisableSchema = z.object({
	code: z.string().trim().min(6).max(32),
	password: z.string().min(1),
});

export const domainSchema = z.object({
	hostname: z.string().min(3),
});

export const mailboxSchema = z.object({
	displayName: z.string().optional(),
	domainId: z.string().min(1),
	localPart: z.string().min(1).max(64),
	ownerUserId: z.string().min(1).optional(),
	type: z.enum(["personal", "shared"]).optional(),
});

export const updateManagedAccountSchema = z.object({
	canManageDomains: z.boolean().optional(),
	canManageMailboxes: z.boolean(),
	canManageUsers: z.boolean().optional(),
	disabled: z.boolean(),
	forwardingEmail: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.email()
			.or(z.literal(""))
			.nullable()
			.optional()
			.transform((value) => (value === undefined ? undefined : value || null))
	),
	name: z.string().trim().min(1).max(100),
	/** Set a new password for the account; every session of that user is revoked. */
	password: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.min(8)
			.max(128)
			.or(z.literal(""))
			.optional()
			.transform((value) => value || null)
	),
	role: z.enum(["admin", "user"]),
});

export const createAccountSchema = z.object({
	domainId: z.string().min(1),
	name: z.string().trim().min(1).max(100).optional(),
	password: z.string().min(8),
	resetEmail: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.email()
			.or(z.literal(""))
			.optional()
			.transform((value) => value || null)
	),
	username: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._%+-]+$/u),
});

export const createMailboxAliasSchema = z.object({
	domainId: z.string().min(1),
	localPart: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._%+-]+$/u)
		.transform((value) => value.toLowerCase()),
});

export const createUserAccountSchema = z.object({
	aliases: z.array(createMailboxAliasSchema).default([]),

	domainId: z.string().min(1),

	password: z.string().min(8).max(128),

	role: z.enum(["admin", "user"]).default("user"),

	// Existing API/MCP clients retain the previous behavior when this is omitted.
	useAllDomains: z.boolean().default(true),

	username: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._%+-]+$/u),
});

export const updateAccountSchema = z.object({
	disabled: z.boolean().optional(),
	email: z.string().email().optional(),
	name: z.string().trim().min(1).max(100),
	password: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.min(8)
			.or(z.literal(""))
			.optional()
			.transform((value) => value || null)
	),
});

export const mailboxAccessSchema = z.object({
	permission: z.enum(["read_only", "send_as", "send_on_behalf", "full_access"]),
	userId: z.string().min(1),
});

export const accountMailboxAccessSchema = z.object({
	mailboxId: z.string().min(1),
	permission: z.enum(["read_only", "send_as", "send_on_behalf", "full_access"]),
});

export const accountMailboxSchema = z.object({
	displayName: z.string().trim().max(100).optional(),
	domainId: z.string().min(1),
	localPart: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._%+-]+$/u),
});

export const updateMailboxSchema = z.object({
	autoReplyBody: z.string().max(10_000).optional(),
	autoReplyEnabled: z.boolean().optional(),
	autoReplySubject: z.string().trim().max(200).optional(),
	displayName: z.string().max(100).nullable().optional(),
	signature: z.string().max(10_000).nullable().optional(),
	useAllDomains: z.boolean().optional(),
});

export const folderSchema = z.object({
	color: z.enum(FOLDER_COLOR_VALUES).default(DEFAULT_FOLDER_COLOR),
	mailboxId: z.string().min(1),
	name: z.string().trim().min(1).max(80),
});

export const updateProfileSchema = z.object({
	forwardingEmail: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.email()
			.or(z.literal(""))
			.optional()
			.transform((value) => (value === undefined ? undefined : value || null))
	),
	name: z.string().trim().min(1).max(100),
	resetEmail: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.email()
			.or(z.literal(""))
			.transform((value) => value || null)
	),
});

export const updateForwardingEmailSchema = z.object({
	forwardingEmail: z.preprocess(
		(value) => (typeof value === "string" ? value.trim() : value),
		z
			.string()
			.email()
			.or(z.literal(""))
			.transform((value) => value || null)
	),
});

export const updateShortcutsSettingsSchema = z.object({
	enabled: z.boolean(),
});

export const updateSpamSettingsSchema = z.object({
	enabled: z.boolean(),
});

export const updateTrashRetentionSettingsSchema = z.object({
	days: z.number().int().min(1).max(365).nullable(),
});

export const updateRemoteContentSettingsSchema = z.object({
	mode: z.enum(["ask", "new_sender", "allow"]),
});

export const trustRemoteContentSenderSchema = z.object({
	sender: z.string().trim().toLowerCase().email().max(320),
});

export const updateRecipientAddressSettingsSchema = z.object({
	enabled: z.boolean(),
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8).max(128),
});

export const routingRuleSchema = z.object({
	action: z.enum(["store", "forward", "reject", "spam", "trash"]).optional(),
	destination: z.string().min(1).optional(),
	domainId: z.string().optional(),
	folderId: z.string().optional(),
	forwardTo: z.string().email().optional(),
	mailboxId: z.string().min(1),
	matchField: z.enum(["email", "content", "title"]).default("email"),
	matchOperator: z.enum(["contains", "exact"]).default("contains"),
	matchValue: z.string().trim().min(1).max(500),
	pattern: z.string().trim().min(1).max(200).optional(),
	priority: z.number().int().default(0),
});

export const domainRoutingRuleSchema = z
	.object({
		action: z.enum(["store", "forward", "reject"]),

		domainId: z.string().min(1),

		enabled: z.boolean().default(true),

		// The rule dialog submits forwardTo for every action, so blank means "not forwarding".
		forwardTo: z.preprocess(
			(value) => (typeof value === "string" ? value.trim() || null : value),
			z.string().email().nullish()
		),

		keepCopy: z.boolean().default(false),

		mailboxId: z.string().min(1).nullish(),

		matchField: z
			.enum(["recipient", "sender", "title", "content"])
			.default("recipient"),

		matchOperator: z
			.enum(["contains", "exact", "starts_with", "ends_with", "regex"])
			.default("contains"),

		matchValue: z.string().trim().min(1).max(500),

		name: z.string().trim().max(120).optional(),

		priority: z.number().int().min(0).max(1000).default(0),

		rejectReason: z.string().trim().max(200).nullish(),
	})
	.superRefine((value, ctx) => {
		if (value.action === "store" && !value.mailboxId) {
			ctx.addIssue({
				code: "custom",
				message: "Choose the mailbox that should receive matching mail",
				path: ["mailboxId"],
			});
		}
		if (value.action === "forward" && !value.forwardTo) {
			ctx.addIssue({
				code: "custom",
				message: "A forwarding destination is required",
				path: ["forwardTo"],
			});
		}
		if (value.action === "forward" && value.keepCopy && !value.mailboxId) {
			ctx.addIssue({
				code: "custom",
				message: "Keeping a copy requires a destination mailbox",
				path: ["mailboxId"],
			});
		}
		if (value.matchOperator === "regex") {
			try {
				compileRulePattern(value.matchValue).test("");
			} catch {
				ctx.addIssue({
					code: "custom",
					message: "Enter a valid regular expression",
					path: ["matchValue"],
				});
			}
		}
	});

export const webhookSchema = z.object({
	description: z.string().trim().max(200).optional(),
	events: z
		.array(z.enum(["message.inbound", "message.outbound", "message.failed"]))
		.min(1)
		.max(3),
	maxAttempts: z.number().int().min(1).max(10).default(5),
	url: z.string().url().max(2048),
});

export const webhookUpdateSchema = z.object({
	description: z.string().trim().max(200).nullish(),
	enabled: z.boolean().optional(),
	events: z
		.array(z.enum(["message.inbound", "message.outbound", "message.failed"]))
		.min(1)
		.max(3)
		.optional(),
	maxAttempts: z.number().int().min(1).max(10).optional(),
	rotateSecret: z.literal(true).optional(),
	url: z.string().url().max(2048).optional(),
});
