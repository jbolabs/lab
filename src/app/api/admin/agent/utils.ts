import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agentJobs, agentSendApprovals, appSettings } from "@/db/schema";
import { parseAgentModelIds } from "@/lib/agent/model-ids";
import {
	getAgentEnabled,
	getAgentProviderConfig,
	getAgentProviderPublicConfig,
	resolveAgentBaseUrl,
} from "@/lib/agent/provider";
import { AGENT_SETTINGS_ID } from "@/lib/agent/provider-constants";
import { requireSessionUser } from "@/lib/api/auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";

const providerSchema = z.object({
	apiKey: z.string().max(2000).optional(),
	baseUrl: z.string().max(500),
	model: z.string().trim().min(1).max(5000),
	preset: z.enum(["openai", "openrouter", "groq", "custom"]),
	provider: z.enum(["cloudflare", "compatible"]),
	rates: z
		.record(
			z.string(),
			z.object({
				input: z.number().min(0).max(1_000_000).nullable(),
				output: z.number().min(0).max(1_000_000).nullable(),
			})
		)
		.optional(),
});
const enabledSchema = z.object({ enabled: z.boolean() });

async function authorize(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) {
		return { env, error: session.error };
	}
	if (!isPrimaryAdmin(session.user)) {
		return {
			env,
			error: Response.json({ error: "Forbidden" }, { status: 403 }),
		};
	}
	return { env, error: null };
}

export async function GET(request: Request) {
	const access = await authorize(request);
	if (access.error) {
		return access.error;
	}
	return Response.json(
		{
			assistantEnabled: await getAgentEnabled(access.env),
			cloudflareAvailable: !!access.env.AI,
			config: await getAgentProviderPublicConfig(access.env),
		},
		{ headers: { "Cache-Control": "no-store" } }
	);
}

export async function PUT(request: Request) {
	const access = await authorize(request);
	if (access.error) {
		return access.error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const body = await request.json().catch(() => null);
	const enabled = enabledSchema.safeParse(body);
	const saveAssistantAvailability = async () => {
		if (enabled.success && Object.keys(body as object).length === 1) {
			const db = getDb(access.env);
			await db
				.insert(appSettings)
				.values({ agentEnabled: enabled.data.enabled, id: AGENT_SETTINGS_ID })
				.onConflictDoUpdate({
					set: { agentEnabled: enabled.data.enabled, updatedAt: new Date() },
					target: appSettings.id,
				});
			if (!enabled.data.enabled) {
				await db
					.update(agentJobs)
					.set({ reason: "Assistant disabled", status: "skipped" })
					.where(eq(agentJobs.status, "pending"));
				await db
					.update(agentSendApprovals)
					.set({ status: "cancelled" })
					.where(eq(agentSendApprovals.status, "pending"));
			}
			return Response.json(
				{ assistantEnabled: enabled.data.enabled },
				{ headers: { "Cache-Control": "no-store" } }
			);
		}
	};
	const response1 = await saveAssistantAvailability();
	if (response1 !== undefined) {
		return response1;
	}
	const parsed = providerSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid provider settings" },
			{ status: 400 }
		);
	}
	const input = parsed.data;
	const modelIds = parseAgentModelIds(input.model);
	const validateModelSelection = () => {
		if (
			modelIds.length === 0 ||
			modelIds.length > 20 ||
			modelIds.some((model) => model.length > 200)
		) {
			return Response.json(
				{ error: "Choose 1 to 20 valid model IDs" },
				{ status: 400 }
			);
		}
	};
	const response2 = validateModelSelection();
	if (response2 !== undefined) {
		return response2;
	}
	if (input.provider === "cloudflare" && !access.env.AI) {
		return Response.json(
			{ error: "Cloudflare Workers AI binding is unavailable" },
			{ status: 400 }
		);
	}
	let baseUrl: string | null = null;
	let apiKey: string | null = null;
	if (input.provider === "compatible") {
		try {
			baseUrl = resolveAgentBaseUrl(input.preset, input.baseUrl);
		} catch {
			return Response.json(
				{ error: "Enter a valid HTTPS provider base URL" },
				{ status: 400 }
			);
		}
		const current = await getAgentProviderConfig(access.env);
		apiKey =
			input.apiKey?.trim() ||
			(current.provider === "compatible" &&
			current.preset === input.preset &&
			current.baseUrl === baseUrl
				? current.apiKey
				: "") ||
			null;
		if (!apiKey) {
			return Response.json(
				{ error: "Enter an API key for this provider" },
				{ status: 400 }
			);
		}
	}
	const values = {
		agentApiKey: apiKey,
		agentBaseUrl: baseUrl,
		agentModel: modelIds.join(", "),
		agentModelRates: JSON.stringify(
			Object.fromEntries(
				modelIds.map((model) => [
					model,
					input.rates?.[model] ?? { input: null, output: null },
				])
			)
		),
		agentPreset: input.provider === "compatible" ? input.preset : null,
		agentProvider: input.provider,
		updatedAt: new Date(),
	};
	await getDb(access.env)
		.insert(appSettings)
		.values({ id: AGENT_SETTINGS_ID, ...values })
		.onConflictDoUpdate({ set: values, target: appSettings.id });
	return Response.json(
		{
			assistantEnabled: await getAgentEnabled(access.env),
			cloudflareAvailable: !!access.env.AI,
			config: await getAgentProviderPublicConfig(access.env),
		},
		{ headers: { "Cache-Control": "no-store" } }
	);
}
