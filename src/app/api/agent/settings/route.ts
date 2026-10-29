import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agentJobs, mailboxAgentSettings, users } from "@/db/schema";
import { getAgentProviderPublicConfig } from "@/lib/agent/provider";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { getCurrentUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

const schema = z.object({
	autoDraftEnabled: z.boolean(),
	dailyLimit: z.number().int().min(1).max(100),
	enabled: z.boolean(),
	instructions: z.string().max(4000),
	mailboxId: z.string().min(1),
	modelId: z.string().max(200).nullable().optional(),
	reviewerUserId: z.string().nullable().optional(),
});

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const mailboxId = new URL(request.url).searchParams.get("mailboxId");
	if (!mailboxId) {
		return Response.json({ error: "Mailbox required" }, { status: 400 });
	}
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (!access?.canRead) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}
	const [settings] = await db
		.select()
		.from(mailboxAgentSettings)
		.where(eq(mailboxAgentSettings.mailboxId, mailboxId))
		.limit(1);
	const reviewers: { id: string; name: string; email: string }[] = [];
	if (access.canManage) {
		const candidates = await db
			.select({
				disabled: users.disabled,
				email: users.email,
				id: users.id,
				name: users.name,
			})
			.from(users)
			.limit(200);
		const eligible = candidates.filter((candidate) => !candidate.disabled);
		const permissions = await Promise.all(
			eligible.map((candidate) =>
				getMailboxAccessLevel(db, { id: candidate.id, role: "user" }, mailboxId)
			)
		);
		for (const [index, candidate] of eligible.entries()) {
			if (permissions[index]?.canSendOnBehalf) {
				reviewers.push({
					email: candidate.email,
					id: candidate.id,
					name: candidate.name,
				});
			}
		}
	}
	const agentProvider = await getAgentProviderPublicConfig(env);
	const provider = agentProvider.configured
		? {
				kind: (() => {
					if (agentProvider.provider === "cloudflare") {
						return "Cloudflare Workers AI";
					}
					if (agentProvider.preset === "custom") {
						return "OpenAI-compatible API";
					}
					return agentProvider.preset;
				})(),
				model: agentProvider.model,
			}
		: null;
	const modelId =
		settings?.modelId && agentProvider.models.includes(settings.modelId)
			? settings.modelId
			: (agentProvider.models[0] ?? null);
	return Response.json({
		autoReplyEnabled: access.mailbox.autoReplyEnabled,
		canConfigureProvider: isPrimaryAdmin(user),
		canManage: access.canManage,
		models: agentProvider.models,
		provider,
		providerConfigured: agentProvider.configured,
		reviewers,
		settings: settings
			? { ...settings, enabled: true, modelId }
			: {
					autoDraftEnabled: false,
					dailyLimit: 25,
					enabled: true,
					instructions: "",
					mailboxId,
					modelId,
					reviewerUserId: access.mailbox.userId,
				},
	});
}

export async function PUT(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json({ error: "Invalid settings" }, { status: 400 });
	}
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, parsed.data.mailboxId);
	if (!access?.canManage) {
		return Response.json(
			{ error: "Mailbox not found or permission denied" },
			{ status: 403 }
		);
	}
	const reviewerId = parsed.data.reviewerUserId || access.mailbox.userId;
	const [reviewer] = await db
		.select()
		.from(users)
		.where(eq(users.id, reviewerId))
		.limit(1);
	const reviewerAccess =
		reviewer && !reviewer.disabled
			? await getMailboxAccessLevel(db, reviewer, parsed.data.mailboxId)
			: null;
	if (!reviewerAccess?.canSendOnBehalf) {
		return Response.json(
			{ error: "Reviewer needs mailbox send permission" },
			{ status: 400 }
		);
	}
	if (parsed.data.autoDraftEnabled && access.mailbox.autoReplyEnabled) {
		return Response.json(
			{
				error: "Disable the out-of-office auto-reply before enabling AI drafts",
			},
			{ status: 400 }
		);
	}
	const agentProvider = await getAgentProviderPublicConfig(env);
	if (
		parsed.data.modelId &&
		!agentProvider.models.includes(parsed.data.modelId)
	) {
		return Response.json(
			{ error: "Choose a configured model" },
			{ status: 400 }
		);
	}
	const modelId = parsed.data.modelId || agentProvider.models[0] || null;
	await db
		.insert(mailboxAgentSettings)
		.values({
			...parsed.data,
			enabled: true,
			modelId,
			reviewerUserId: reviewerId,
		})
		.onConflictDoUpdate({
			set: {
				autoDraftEnabled: parsed.data.autoDraftEnabled,
				dailyLimit: parsed.data.dailyLimit,
				enabled: true,
				instructions: parsed.data.instructions,
				modelId,
				reviewerUserId: reviewerId,
				updatedAt: new Date(),
			},
			target: mailboxAgentSettings.mailboxId,
		});
	if (!parsed.data.autoDraftEnabled) {
		await db
			.update(agentJobs)
			.set({ reason: "Auto-drafting disabled", status: "skipped" })
			.where(
				and(
					eq(agentJobs.mailboxId, parsed.data.mailboxId),
					eq(agentJobs.status, "pending")
				)
			);
	}
	return Response.json({ ok: true });
}
