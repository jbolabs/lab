import { sql } from "drizzle-orm";
import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
	"users",
	{
		avatarKey: text("avatar_key"),

		bookingUsername: text("booking_username"),

		// Capabilities the primary admin grants to other admins.
		canManageDomains: integer("can_manage_domains", { mode: "boolean" })
			.notNull()
			.default(false),

		canManageMailboxes: integer("can_manage_mailboxes", { mode: "boolean" })
			.notNull()
			.default(false),

		canManageUsers: integer("can_manage_users", { mode: "boolean" })
			.notNull()
			.default(false),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		createdByUserId: text("created_by_user_id").references(
			(): AnySQLiteColumn => users.id,
			{ onDelete: "set null" }
		),

		// Set when an admin deletes the account. The account is also `disabled` and can be restored until the
		// retention window ends, after which the scheduled purge removes it and its data.
		deletedAt: integer("deleted_at", { mode: "timestamp" }),

		disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),

		email: text("email").notNull().unique(),

		forwardingEmail: text("forwarding_email"),

		id: text("id").primaryKey(),

		// Exactly one account is the primary admin: the one created during setup.
		// They own administrator management and can hand the role to another account.
		isPrimaryAdmin: integer("is_primary_admin", { mode: "boolean" })
			.notNull()
			.default(false),

		keyboardShortcutsEnabled: integer("keyboard_shortcuts_enabled", {
			mode: "boolean",
		})
			.notNull()
			.default(true),

		lastSignInAt: integer("last_sign_in_at", { mode: "timestamp" }),

		name: text("name").notNull(),

		passwordHash: text("password_hash").notNull(),

		// When the reader loads remote images and styles without being asked: always ask, only for senders not yet allowed, or always.
		remoteContentMode: text("remote_content_mode", {
			enum: ["ask", "new_sender", "allow"],
		})
			.notNull()
			.default("allow"),

		resetEmail: text("reset_email"),

		role: text("role", { enum: ["admin", "user"] })
			.notNull()
			.default("user"),

		// Off shows the mailbox only. On shows Name <mailbox> on To, Cc, and Bcc.
		showFullRecipientAddresses: integer("show_full_recipient_addresses", {
			mode: "boolean",
		})
			.notNull()
			.default(false),

		spamProtectionEnabled: integer("spam_protection_enabled", {
			mode: "boolean",
		})
			.notNull()
			.default(true),

		timeZone: text("time_zone"),

		totpConfirmedAt: integer("totp_confirmed_at", { mode: "timestamp" }),

		totpEnabled: integer("totp_enabled", { mode: "boolean" })
			.notNull()
			.default(false),

		// TOTP second factor. The secret is written at enrolment and only counts
		// once the user has proven a code from their authenticator.
		totpSecret: text("totp_secret"),

		/** Days a message may stay in Trash or Spam before the scheduled purge deletes it; null keeps it forever. */
		trashRetentionDays: integer("trash_retention_days"),
	},
	(t) => [uniqueIndex("users_booking_username_idx").on(t.bookingUsername)]
);

export const domains = sqliteTable(
	"domains",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		/** The operator skipped adding/checking DNS; set until they confirm the records exist. */
		dnsSkipped: integer("dns_skipped", { mode: "boolean" })
			.notNull()
			.default(false),
		hostname: text("hostname").notNull(),
		id: text("id").primaryKey(),
		receivingProvider: text("receiving_provider", {
			enum: ["none", "cloudflare", "resend", "ses"],
		})
			.notNull()
			.default("cloudflare"),
		routingEnabled: integer("routing_enabled", { mode: "boolean" })
			.notNull()
			.default(false),
		routingStatus: text("routing_status"),
		sendingEnabled: integer("sending_enabled", { mode: "boolean" })
			.notNull()
			.default(false),
		sendingProvider: text("sending_provider", {
			enum: ["none", "cloudflare", "resend", "ses"],
		})
			.notNull()
			.default("none"),
		sendingRequested: integer("sending_requested", { mode: "boolean" })
			.notNull()
			.default(false),
		sendingSubdomainTag: text("sending_subdomain_tag"),
		status: text("status", { enum: ["pending", "active", "error"] })
			.notNull()
			.default("pending"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		zoneId: text("zone_id").notNull(),
	},
	(t) => [
		uniqueIndex("domains_hostname_idx").on(t.hostname),
		index("domains_user_idx").on(t.userId),
	]
);

export const mailboxes = sqliteTable(
	"mailboxes",
	{
		autoReplyBody: text("auto_reply_body").notNull().default(""),
		autoReplyEnabled: integer("auto_reply_enabled", { mode: "boolean" })
			.notNull()
			.default(false),
		autoReplySubject: text("auto_reply_subject")
			.notNull()
			.default("Out of office"),
		avatarKey: text("avatar_key"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
		displayName: text("display_name"),
		domainId: text("domain_id")
			.notNull()
			.references(() => domains.id, { onDelete: "cascade" }),
		id: text("id").primaryKey(),
		localPart: text("local_part").notNull(),
		signature: text("signature"),
		type: text("type", { enum: ["personal", "shared"] })
			.notNull()
			.default("personal"),
		useAllDomains: integer("use_all_domains", { mode: "boolean" })
			.notNull()
			.default(true),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("mailboxes_address_idx").on(t.domainId, t.localPart),
		index("mailboxes_user_idx").on(t.userId),
	]
);

export const mailboxAliases = sqliteTable(
	"mailbox_aliases",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		domainId: text("domain_id")
			.notNull()
			.references(() => domains.id, { onDelete: "cascade" }),
		id: text("id").primaryKey(),
		localPart: text("local_part").notNull(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("mailbox_aliases_address_idx").on(t.domainId, t.localPart),
		index("mailbox_aliases_mailbox_idx").on(t.mailboxId),
	]
);

export const autoReplyDeliveries = sqliteTable(
	"auto_reply_deliveries",
	{
		id: text("id").primaryKey(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		recipient: text("recipient").notNull(),
		sentAt: integer("sent_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		uniqueIndex("auto_reply_deliveries_mailbox_recipient_idx").on(
			t.mailboxId,
			t.recipient
		),
		index("auto_reply_deliveries_sent_idx").on(t.sentAt),
	]
);

export const mailboxAccess = sqliteTable(
	"mailbox_access",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		id: text("id").primaryKey(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		permission: text("permission", {
			enum: ["read_only", "send_as", "send_on_behalf", "full_access"],
		})
			.notNull()
			.default("read_only"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("mailbox_access_mailbox_user_idx").on(t.mailboxId, t.userId),
		index("mailbox_access_user_idx").on(t.userId),
		index("mailbox_access_mailbox_idx").on(t.mailboxId),
	]
);

export const contacts = sqliteTable(
	"contacts",
	{
		avatarKey: text("avatar_key"),

		blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		displayName: text("display_name"),

		email: text("email").notNull(),

		id: text("id").primaryKey(),

		lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),

		// Set when the user allows remote content from this sender; "new_sender" mode loads it without asking afterwards.
		remoteContentAllowed: integer("remote_content_allowed", { mode: "boolean" })
			.notNull()
			.default(false),

		source: text("source", { enum: ["manual", "inbound", "outbound"] })
			.notNull()
			.default("inbound"),

		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("contacts_user_email_idx").on(t.userId, t.email),
		index("contacts_user_idx").on(t.userId),
	]
);

export const folders = sqliteTable(
	"folders",
	{
		color: text("color").notNull().default("#2563eb"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("folders_mailbox_name_idx").on(t.mailboxId, t.name),
		index("folders_user_idx").on(t.userId),
		index("folders_mailbox_idx").on(t.mailboxId),
	]
);

export const jmapMailboxRevisions = sqliteTable("jmap_mailbox_revisions", {
	mailboxId: text("mailbox_id").primaryKey(),
	revision: integer("revision").notNull().default(0),
});

/**
 * JMAP change log, written only by the `jmap_changes_*` triggers of migration
 * 0064: one row per created, updated or destroyed Email (and per folder or
 * mailbox change), so `Email/changes`, `Mailbox/changes` and `Thread/changes`
 * return real deltas. `seq` is the state; rows older than the retention
 * window are pruned and `jmap_change_floor` records the last pruned seq.
 */
export const jmapChanges = sqliteTable(
	"jmap_changes",
	{
		change: text("change", {
			enum: ["created", "updated", "destroyed"],
		}).notNull(),
		createdAt: integer("created_at")
			.notNull()
			.default(sql`(unixepoch())`),
		mailboxId: text("mailbox_id").notNull(),
		objectId: text("object_id").notNull(),
		objectType: text("object_type", { enum: ["email", "mailbox"] }).notNull(),
		seq: integer("seq").primaryKey({ autoIncrement: true }),
		threadId: text("thread_id"),
	},
	(table) => [
		index("jmap_changes_mailbox_seq_idx").on(table.mailboxId, table.seq),
	]
);

export const jmapChangeFloor = sqliteTable("jmap_change_floor", {
	id: integer("id").primaryKey(),
	seq: integer("seq").notNull().default(0),
});

export const apiKeys = sqliteTable("api_keys", {
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	id: text("id").primaryKey(),
	keyHash: text("key_hash").notNull(),
	/** `device` keys come from a mobile sign-in (`/api/auth/device`) and are listed under Devices. */
	kind: text("kind", { enum: ["legacy", "mcp", "device"] })
		.notNull()
		.default("legacy"),
	lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
	mailboxScopeEnabled: integer("mailbox_scope_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	name: text("name").notNull(),
	prefix: text("prefix").notNull(),
	scopes: text("scopes").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const messages = sqliteTable(
	"messages",
	{
		bccAddr: text("bcc_addr"),

		ccAddr: text("cc_addr"),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),

		folderId: text("folder_id").references(() => folders.id, {
			onDelete: "set null",
		}),

		fromAddr: text("from_addr").notNull(),

		htmlBody: text("html_body"),

		id: text("id").primaryKey(),

		// RFC 5322 threading headers, kept so replies land in the right conversation
		// and so outgoing replies can carry them on to the recipient's client.
		inReplyTo: text("in_reply_to"),

		mailboxId: text("mailbox_id").references(() => mailboxes.id, {
			onDelete: "set null",
		}),

		providerMessageId: text("provider_message_id"),

		rawR2Key: text("raw_r2_key"),

		read: integer("read", { mode: "boolean" }).notNull().default(false),

		references: text("references_header"),

		/** Full Reply-To header, comma-joined. Replies go here instead of `fromAddr` when set. */
		replyTo: text("reply_to"),

		snippet: text("snippet"),

		snoozedUntil: integer("snoozed_until", { mode: "timestamp" }),

		spamAnalysisError: text("spam_analysis_error"),

		spamAnalyzedAt: integer("spam_analyzed_at", { mode: "timestamp" }),

		spamScore: integer("spam_score"),

		spamSignals: text("spam_signals"),

		spamVerdict: text("spam_verdict", {
			enum: ["inbox", "suspicious", "spam"],
		}),

		starred: integer("starred", { mode: "boolean" }).notNull().default(false),

		status: text("status").notNull().default("received"),

		subject: text("subject"),

		textBody: text("text_body"),

		threadId: text("thread_id"),

		toAddr: text("to_addr").notNull(),

		/** When the message last entered Trash or Spam; maintained by triggers (migration 0053). */
		trashedAt: integer("trashed_at", { mode: "timestamp" }),

		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("messages_user_created_idx").on(t.userId, t.createdAt),
		index("messages_mailbox_idx").on(t.mailboxId),
		index("messages_folder_idx").on(t.folderId),
		index("messages_thread_idx").on(t.mailboxId, t.threadId),
		index("messages_provider_message_idx").on(t.mailboxId, t.providerMessageId),
		index("messages_raw_r2_key_idx").on(t.rawR2Key),
		index("messages_trashed_at_idx").on(t.trashedAt),
		index("messages_inbox_page_idx").on(
			t.mailboxId,
			t.status,
			t.folderId,
			sql`${t.createdAt} desc`,
			sql`${t.id} desc`
		),
		index("messages_thread_key_idx").on(
			t.mailboxId,
			t.status,
			t.folderId,
			sql`coalesce(${t.threadId}, ${t.id})`,
			t.createdAt
		),
		index("messages_mailbox_thread_key_idx").on(
			t.mailboxId,
			sql`coalesce(${t.threadId}, ${t.id})`
		),
	]
);

export const spamTokenStats = sqliteTable(
	"spam_token_stats",
	{
		hamCount: integer("ham_count").notNull().default(0),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		spamCount: integer("spam_count").notNull().default(0),
		token: text("token").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(t) => [
		uniqueIndex("spam_token_stats_mailbox_token_idx").on(t.mailboxId, t.token),
		index("spam_token_stats_mailbox_idx").on(t.mailboxId),
	]
);

export const spamReputation = sqliteTable(
	"spam_reputation",
	{
		firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		hamCount: integer("ham_count").notNull().default(0),
		key: text("key").notNull(),
		lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		messagesSeen: integer("messages_seen").notNull().default(0),
		spamCount: integer("spam_count").notNull().default(0),
		type: text("type", { enum: ["email", "domain", "fingerprint"] }).notNull(),
	},
	(t) => [
		uniqueIndex("spam_reputation_mailbox_type_key_idx").on(
			t.mailboxId,
			t.type,
			t.key
		),
		index("spam_reputation_mailbox_idx").on(t.mailboxId),
	]
);

export const spamFeedback = sqliteTable(
	"spam_feedback",
	{
		actorUserId: text("actor_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		classification: text("classification", { enum: ["spam", "ham"] }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		messageId: text("message_id")
			.primaryKey()
			.references(() => messages.id, { onDelete: "cascade" }),
		reputationKeys: text("reputation_keys").notNull(),
		tokenizerVersion: integer("tokenizer_version").notNull().default(1),
		trainingTokens: text("training_tokens").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(t) => [index("spam_feedback_mailbox_idx").on(t.mailboxId)]
);

export const messageAttachments = sqliteTable(
	"message_attachments",
	{
		contentId: text("content_id"),
		contentType: text("content_type").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		disposition: text("disposition", { enum: ["attachment", "inline"] })
			.notNull()
			.default("attachment"),
		filename: text("filename").notNull(),
		id: text("id").primaryKey(),
		messageId: text("message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		r2Key: text("r2_key").notNull().unique(),
		size: integer("size").notNull(),
		/** Set when the attachment is moved to the Drive trash; hidden from the email until restored, purged after 30 days. */
		trashedAt: integer("trashed_at", { mode: "timestamp" }),
	},
	(t) => [index("message_attachments_message_idx").on(t.messageId)]
);

export const sharedAttachmentLinks = sqliteTable("shared_attachment_links", {
	attachmentId: text("attachment_id")
		.notNull()
		.references(() => messageAttachments.id, { onDelete: "cascade" })
		.unique(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	id: text("id").primaryKey(),
});

export const outboundJobs = sqliteTable("outbound_jobs", {
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	error: text("error"),
	id: text("id").primaryKey(),
	messageId: text("message_id").references(() => messages.id, {
		onDelete: "set null",
	}),
	payload: text("payload").notNull(),
	scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
	status: text("status", { enum: ["queued", "sending", "sent", "failed"] })
		.notNull()
		.default("queued"),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const emailTemplates = sqliteTable(
	"email_templates",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		subject: text("subject").notNull().default(""),
		textBody: text("text_body").notNull().default(""),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [index("email_templates_user_idx").on(t.userId)]
);

export const calendarEvents = sqliteTable(
	"calendar_events",
	{
		attendees: text("attendees").notNull().default("[]"),
		color: text("color").notNull().default("blue"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		description: text("description").notNull().default(""),
		endsAt: integer("ends_at", { mode: "timestamp" }).notNull(),
		excludedOccurrences: text("excluded_occurrences").notNull().default("[]"),
		id: text("id").primaryKey(),
		location: text("location").notNull().default(""),
		mailboxId: text("mailbox_id").references(() => mailboxes.id, {
			onDelete: "set null",
		}),
		repeat: text("repeat", {
			enum: ["none", "daily", "weekly", "monthly", "weekdays"],
		})
			.notNull()
			.default("none"),
		repeatAnchorDay: integer("repeat_anchor_day"),
		repeatDays: text("repeat_days").notNull().default("[]"),
		repeatUntil: integer("repeat_until", { mode: "timestamp" }),
		startsAt: integer("starts_at", { mode: "timestamp" }).notNull(),
		timeZone: text("time_zone"),
		title: text("title").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [index("calendar_events_user_starts_idx").on(t.userId, t.startsAt)]
);

export const bookingEvents = sqliteTable(
	"booking_events",
	{
		color: text("color").notNull().default("#2563eb"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		description: text("description").notNull().default(""),
		durationMinutes: integer("duration_minutes").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		endTime: text("end_time").notNull().default("17:00"),
		hostIds: text("host_ids").notNull().default("[]"),
		id: text("id").primaryKey(),
		location: text("location").notNull().default(""),
		name: text("name").notNull(),
		slug: text("slug").notNull().default(""),
		startTime: text("start_time").notNull().default("09:00"),
		timeRanges: text("time_ranges")
			.notNull()
			.default('[{"startTime":"09:00","endTime":"17:00"}]'),
		timeZone: text("time_zone").notNull().default("UTC"),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		weekdays: text("weekdays").notNull().default("[1,2,3,4,5]"),
	},
	(t) => [
		index("booking_events_user_idx").on(t.userId),
		uniqueIndex("booking_events_user_slug_idx").on(t.userId, t.slug),
	]
);

export const routingRules = sqliteTable(
	"routing_rules",
	{
		action: text("action", {
			enum: ["store", "forward", "reject", "spam", "trash"],
		})
			.notNull()
			.default("store"),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		domainId: text("domain_id")
			.notNull()
			.references(() => domains.id, { onDelete: "cascade" }),

		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),

		folderId: text("folder_id").references(() => folders.id, {
			onDelete: "set null",
		}),

		forwardTo: text("forward_to"),

		id: text("id").primaryKey(),

		// Forward actions drop the message by default; keepCopy also delivers it to the mailbox.
		keepCopy: integer("keep_copy", { mode: "boolean" })
			.notNull()
			.default(false),

		lastMatchedAt: integer("last_matched_at", { mode: "timestamp" }),

		mailboxId: text("mailbox_id").references(() => mailboxes.id, {
			onDelete: "set null",
		}),

		matchCount: integer("match_count").notNull().default(0),

		matchField: text("match_field", {
			enum: ["email", "content", "title", "sender", "recipient"],
		})
			.notNull()
			.default("email"),

		matchOperator: text("match_operator", {
			enum: ["contains", "exact", "starts_with", "ends_with", "regex"],
		})
			.notNull()
			.default("contains"),

		matchValue: text("match_value").notNull().default(""),

		name: text("name"),

		pattern: text("pattern").notNull(),

		priority: integer("priority").notNull().default(0),

		rejectReason: text("reject_reason"),

		// "mailbox" rules run after delivery and file the message into a folder or system status.
		// "domain" rules run during address resolution and can catch-all, forward, or reject.
		scope: text("scope", { enum: ["mailbox", "domain"] })
			.notNull()
			.default("mailbox"),

		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("routing_rules_domain_scope_idx").on(t.domainId, t.scope, t.enabled),
		index("routing_rules_mailbox_idx").on(t.mailboxId),
		index("routing_rules_priority_idx").on(t.priority),
	]
);

export const webhooks = sqliteTable("webhooks", {
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	description: text("description"),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	events: text("events").notNull(),
	id: text("id").primaryKey(),
	maxAttempts: integer("max_attempts").notNull().default(5),
	secret: text("secret").notNull(),
	url: text("url").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const webhookDeliveries = sqliteTable(
	"webhook_deliveries",
	{
		attempts: integer("attempts").notNull().default(0),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		durationMs: integer("duration_ms"),

		error: text("error"),

		eventType: text("event_type").notNull(),

		id: text("id").primaryKey(),

		lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),

		nextRetryAt: integer("next_retry_at", { mode: "timestamp" }),

		payload: text("payload").notNull(),

		responseStatus: integer("response_status"),

		// pending | delivered | failed | retrying | exhausted
		status: text("status").notNull().default("pending"),

		webhookId: text("webhook_id")
			.notNull()
			.references(() => webhooks.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("webhook_deliveries_webhook_idx").on(t.webhookId, t.createdAt),
		index("webhook_deliveries_status_idx").on(t.status),
	]
);

export const sessions = sqliteTable("sessions", {
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	id: text("id").primaryKey(),
	tokenHash: text("token_hash").notNull().unique(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

/** A native app's push registration (APNs), owned by the device's API key. */
export const pushDevices = sqliteTable(
	"push_devices",
	{
		apiKeyId: text("api_key_id")
			.notNull()
			.references(() => apiKeys.id, { onDelete: "cascade" }),
		/** The app's own id for this account; echoed in pushes so a tap opens the right account. */
		clientRef: text("client_ref"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		environment: text("environment", { enum: ["production", "sandbox"] })
			.notNull()
			.default("production"),
		id: text("id").primaryKey(),
		platform: text("platform", { enum: ["apns"] }).notNull(),
		previews: integer("previews", { mode: "boolean" }).notNull().default(true),
		/** Base64 raw P-256 public key; previews are encrypted to it. */
		publicKey: text("public_key"),
		token: text("token").notNull(),
		topic: text("topic").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("push_devices_platform_token_user_idx").on(
			table.platform,
			table.token,
			table.userId
		),
		index("push_devices_user_idx").on(table.userId),
	]
);

export const pushSubscriptions = sqliteTable(
	"push_subscriptions",
	{
		auth: text("auth").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		endpoint: text("endpoint").notNull(),
		id: text("id").primaryKey(),
		p256dh: text("p256dh").notNull(),
		sessionId: text("session_id")
			.notNull()
			.references(() => sessions.id, { onDelete: "cascade" }),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
		index("push_subscriptions_user_idx").on(t.userId),
		index("push_subscriptions_session_idx").on(t.sessionId),
	]
);

/** Single-use links mailed to a user's recovery address. Only the hash is stored. */
export const passwordResetTokens = sqliteTable(
	"password_reset_tokens",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		id: text("id").primaryKey(),
		tokenHash: text("token_hash").notNull().unique(),
		usedAt: integer("used_at", { mode: "timestamp" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [index("password_reset_tokens_user_idx").on(t.userId)]
);

/** One-time backup codes for accounts with TOTP, hashed like session tokens. */
export const mfaRecoveryCodes = sqliteTable(
	"mfa_recovery_codes",
	{
		codeHash: text("code_hash").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		usedAt: integer("used_at", { mode: "timestamp" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [index("mfa_recovery_codes_user_idx").on(t.userId)]
);

/**
 * A password that checked out but still needs a second factor. The challenge
 * token stands in for the password on the follow-up request, so the password
 * is never held client-side between the two steps.
 */
export const loginChallenges = sqliteTable("login_challenges", {
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	id: text("id").primaryKey(),
	tokenHash: text("token_hash").notNull().unique(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const auditLogs = sqliteTable(
	"audit_logs",
	{
		action: text("action").notNull(),
		actorUserId: text("actor_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		mailboxId: text("mailbox_id").references(() => mailboxes.id, {
			onDelete: "set null",
		}),
		messageId: text("message_id").references(() => messages.id, {
			onDelete: "set null",
		}),
		metadata: text("metadata"),
		targetUserId: text("target_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		index("audit_logs_actor_idx").on(t.actorUserId),
		index("audit_logs_mailbox_idx").on(t.mailboxId),
		index("audit_logs_created_idx").on(t.createdAt),
	]
);

export const backupSettings = sqliteTable("backup_settings", {
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	excludedTableGroups: text("excluded_table_groups").notNull().default("[]"),
	id: text("id").primaryKey(),
	retentionDays: integer("retention_days").notNull().default(30),
	retentionEnabled: integer("retention_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	scheduleType: text("schedule_type", { enum: ["daily", "weekly", "monthly"] })
		.notNull()
		.default("daily"),
	scheduleValue: integer("schedule_value"),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const appSettings = sqliteTable("app_settings", {
	agentApiKey: text("agent_api_key"),
	agentBaseUrl: text("agent_base_url"),
	agentEnabled: integer("agent_enabled", { mode: "boolean" })
		.notNull()
		.default(true),
	agentModel: text("agent_model"),
	agentModelRates: text("agent_model_rates"),
	agentPreset: text("agent_preset", {
		enum: ["openai", "openrouter", "groq", "custom"],
	}),
	agentProvider: text("agent_provider", { enum: ["cloudflare", "compatible"] }),
	appName: text("app_name").notNull().default("Mailflare"),
	/** JSON: AWS access key, secret and region (see src/lib/aws/config.ts). */
	awsConfig: text("aws_config"),
	/** Per-user Drive storage cap in bytes; null means unlimited. */
	driveStorageLimitBytes: integer("drive_storage_limit_bytes"),
	iconKey: text("icon_key"),
	id: text("id").primaryKey(),
	outboundAttachmentMaxMb: integer("outbound_attachment_max_mb")
		.notNull()
		.default(25),
	resendApiKey: text("resend_api_key"),
	resendWebhookId: text("resend_webhook_id"),
	resendWebhookSecret: text("resend_webhook_secret"),
	/** JSON: the shared SES inbound resources Mailflare created (bucket, topic, rule set, webhook token). */
	sesReceiving: text("ses_receiving"),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const licenseSettings = sqliteTable("license_settings", {
	activatedAt: integer("activated_at", { mode: "timestamp" }),

	features: text("features").notNull().default("[]"),

	id: text("id").primaryKey(),

	instanceId: text("instance_id").notNull().unique(),

	instanceUrl: text("instance_url"),

	licenseKeyHash: text("license_key_hash"),

	plan: text("plan", { enum: ["community", "pro", "team"] })
		.notNull()
		.default("community"),

	// Account seats from Paymug's seatLimit; null is unlimited. Rows predating seats keep one.
	seatLimit: integer("seat_limit").default(1),

	state: text("state", {
		enum: ["inactive", "active", "invalid", "expired", "deactivated"],
	})
		.notNull()
		.default("inactive"),

	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),

	validatedAt: integer("validated_at", { mode: "timestamp" }),
});

export const backups = sqliteTable(
	"backups",
	{
		completedAt: integer("completed_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		error: text("error"),
		filename: text("filename"),
		id: text("id").primaryKey(),
		r2Key: text("r2_key"),
		size: integer("size"),
		startedAt: integer("started_at", { mode: "timestamp" }),
		status: text("status", {
			enum: ["queued", "running", "completed", "failed"],
		})
			.notNull()
			.default("queued"),
		trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
	},
	(t) => [
		index("backups_created_idx").on(t.createdAt),
		index("backups_status_idx").on(t.status),
	]
);

export const mailboxAgentSettings = sqliteTable("mailbox_agent_settings", {
	autoDraftEnabled: integer("auto_draft_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	dailyLimit: integer("daily_limit").notNull().default(25),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
	instructions: text("instructions").notNull().default(""),
	mailboxId: text("mailbox_id")
		.primaryKey()
		.references(() => mailboxes.id, { onDelete: "cascade" }),
	modelId: text("model_id"),
	reviewerUserId: text("reviewer_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const aiUsage = sqliteTable(
	"ai_usage",
	{
		costUsdMicros: integer("cost_usd_micros"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		inputTokens: integer("input_tokens"),
		model: text("model").notNull(),
		outputTokens: integer("output_tokens"),
		provider: text("provider").notNull(),
		source: text("source").notNull(),
	},
	(t) => [index("ai_usage_created_idx").on(t.createdAt)]
);

export const agentConversations = sqliteTable(
	"agent_conversations",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		title: text("title").notNull().default("New conversation"),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("agent_conversations_owner_idx").on(
			t.userId,
			t.mailboxId,
			t.updatedAt
		),
	]
);

export const agentChatMessages = sqliteTable(
	"agent_chat_messages",
	{
		content: text("content").notNull(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => agentConversations.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
		toolName: text("tool_name"),
	},
	(t) => [
		index("agent_chat_messages_conversation_idx").on(
			t.conversationId,
			t.createdAt
		),
	]
);

export const agentJobs = sqliteTable(
	"agent_jobs",
	{
		attempts: integer("attempts").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		draftId: text("draft_id").references(() => messages.id, {
			onDelete: "set null",
		}),
		id: text("id").primaryKey(),
		leaseUntil: integer("lease_until", { mode: "timestamp" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		nextAttemptAt: integer("next_attempt_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		reason: text("reason"),
		reviewerUserId: text("reviewer_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		sourceMessageId: text("source_message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["pending", "running", "completed", "skipped", "failed"],
		})
			.notNull()
			.default("pending"),
	},
	(t) => [
		uniqueIndex("agent_jobs_source_idx").on(t.mailboxId, t.sourceMessageId),
		index("agent_jobs_due_idx").on(t.status, t.nextAttemptAt),
	]
);

export const agentDraftMetadata = sqliteTable("agent_draft_metadata", {
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	draftId: text("draft_id")
		.primaryKey()
		.references(() => messages.id, { onDelete: "cascade" }),
	humanEditedAt: integer("human_edited_at", { mode: "timestamp" }),
	mailboxId: text("mailbox_id")
		.notNull()
		.references(() => mailboxes.id, { onDelete: "cascade" }),
	origin: text("origin", { enum: ["chat", "auto", "mcp"] }).notNull(),
	revision: integer("revision").notNull().default(1),
	scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
	sourceMessageId: text("source_message_id").references(() => messages.id, {
		onDelete: "set null",
	}),
});

export const agentSendApprovals = sqliteTable(
	"agent_send_approvals",
	{
		claimedAt: integer("claimed_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		draftId: text("draft_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		id: text("id").primaryKey(),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
		messageId: text("message_id"),
		payloadHash: text("payload_hash").notNull(),
		requestKeyId: text("request_key_id").references(() => apiKeys.id, {
			onDelete: "set null",
		}),
		revision: integer("revision").notNull(),
		status: text("status", {
			enum: ["pending", "claimed", "sent", "unknown", "expired", "cancelled"],
		})
			.notNull()
			.default("pending"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("agent_send_approvals_user_idx").on(t.userId, t.status),
		uniqueIndex("agent_send_approvals_delivery_idx")
			.on(t.draftId)
			.where(sql`status IN ('claimed', 'sent', 'unknown')`),
	]
);

export const mcpKeyMailboxes = sqliteTable(
	"mcp_key_mailboxes",
	{
		keyId: text("key_id")
			.notNull()
			.references(() => apiKeys.id, { onDelete: "cascade" }),
		mailboxId: text("mailbox_id")
			.notNull()
			.references(() => mailboxes.id, { onDelete: "cascade" }),
	},
	(t) => [uniqueIndex("mcp_key_mailbox_idx").on(t.keyId, t.mailboxId)]
);

export const driveItems = sqliteTable(
	"drive_items",
	{
		contentType: text("content_type")
			.notNull()
			.default("application/octet-stream"),

		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		id: text("id").primaryKey(),

		kind: text("kind", { enum: ["file", "folder"] }).notNull(),

		linkToken: text("link_token"),

		name: text("name").notNull(),

		ownerId: text("owner_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		parentId: text("parent_id"),

		r2Key: text("r2_key"),

		size: integer("size").notNull().default(0),

		trashedAt: integer("trashed_at", { mode: "timestamp" }),

		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),

		uploadFingerprint: text("upload_fingerprint"),

		// Set while a multipart upload is in flight; such rows stay hidden until the upload completes.
		uploadId: text("upload_id"),

		uploadPartSize: integer("upload_part_size"),
	},
	(t) => [
		index("drive_items_owner_parent_idx").on(t.ownerId, t.parentId),
		uniqueIndex("drive_items_link_token_idx").on(t.linkToken),
	]
);

export const driveUploadParts = sqliteTable(
	"drive_upload_parts",
	{
		etag: text("etag").notNull(),
		itemId: text("item_id")
			.notNull()
			.references(() => driveItems.id, { onDelete: "cascade" }),
		partNumber: integer("part_number").notNull(),
	},
	(t) => [uniqueIndex("drive_upload_parts_idx").on(t.itemId, t.partNumber)]
);

export const driveShares = sqliteTable(
	"drive_shares",
	{
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		id: text("id").primaryKey(),
		itemId: text("item_id")
			.notNull()
			.references(() => driveItems.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["view", "edit"] })
			.notNull()
			.default("view"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("drive_shares_item_user_idx").on(t.itemId, t.userId),
		index("drive_shares_user_idx").on(t.userId),
	]
);

// OAuth credentials use epoch seconds, matching the framework-independent D1/SQLite store.
export const oauthClients = sqliteTable("oauth_clients", {
	createdAt: integer("created_at").notNull(),
	grants: text("grants").notNull(),
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	redirectUris: text("redirect_uris").notNull(),
});

export const oauthGrants = sqliteTable("oauth_grants", {
	clientId: text("client_id")
		.notNull()
		.references(() => oauthClients.id, { onDelete: "cascade" }),
	expiresAt: integer("expires_at").notNull(),
	keyId: text("key_id")
		.primaryKey()
		.references(() => apiKeys.id, { onDelete: "cascade" }),
	resource: text("resource").notNull(),
	revokedAt: integer("revoked_at"),
});

export const oauthRequests = sqliteTable("oauth_requests", {
	expiresAt: integer("expires_at").notNull(),
	hash: text("hash").primaryKey(),
	parameters: text("parameters").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const oauthCodes = sqliteTable(
	"oauth_codes",
	{
		challenge: text("challenge").notNull(),
		consumedAt: integer("consumed_at"),
		expiresAt: integer("expires_at").notNull(),
		hash: text("hash").primaryKey(),
		keyId: text("key_id")
			.notNull()
			.references(() => oauthGrants.keyId, { onDelete: "cascade" }),
		redirectUri: text("redirect_uri").notNull(),
		scopes: text("scopes").notNull(),
	},
	(t) => [index("oauth_codes_grant_idx").on(t.keyId)]
);

export const oauthTokens = sqliteTable(
	"oauth_tokens",
	{
		accessExpiresAt: integer("access_expires_at").notNull(),
		accessHash: text("access_hash").primaryKey(),
		consumedAt: integer("consumed_at"),
		keyId: text("key_id")
			.notNull()
			.references(() => oauthGrants.keyId, { onDelete: "cascade" }),
		refreshExpiresAt: integer("refresh_expires_at").notNull(),
		refreshHash: text("refresh_hash").notNull().unique(),
		scopes: text("scopes").notNull(),
	},
	(t) => [index("oauth_tokens_grant_idx").on(t.keyId)]
);

export const oauthRateLimits = sqliteTable("oauth_rate_limits", {
	attempts: integer("attempts").notNull(),
	expiresAt: integer("expires_at").notNull(),
	id: text("id").primaryKey(),
});

export const schema = {
	agentChatMessages,
	agentConversations,
	agentDraftMetadata,
	agentJobs,
	agentSendApprovals,
	aiUsage,
	apiKeys,
	appSettings,
	auditLogs,
	autoReplyDeliveries,
	backupSettings,
	backups,
	bookingEvents,
	calendarEvents,
	contacts,
	domains,
	driveItems,
	driveShares,
	driveUploadParts,
	emailTemplates,
	folders,
	licenseSettings,
	mailboxAccess,
	mailboxAgentSettings,
	mailboxAliases,
	mailboxes,
	mcpKeyMailboxes,
	messageAttachments,
	messages,
	oauthClients,
	oauthCodes,
	oauthGrants,
	oauthRateLimits,
	oauthRequests,
	oauthTokens,
	outboundJobs,
	pushSubscriptions,
	routingRules,
	sessions,
	sharedAttachmentLinks,
	spamFeedback,
	spamReputation,
	spamTokenStats,
	users,
	webhookDeliveries,
	webhooks,
};
