import { streamText, stepCountIs } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
	agentChatMessages,
	agentConversations,
	mailboxAgentSettings,
	messages,
} from "@/db/schema";
import { recordAiUsage } from "@/lib/ai/usage";
import {
	CALENDAR_TOOL_NAMES,
	calendarToolDescriptions,
	calendarToolSchemas,
	runCalendarTool,
} from "@/lib/calendar/tools";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import { normalizeTimeZone } from "@/lib/time/utils";

import { agentProviderErrorMessage } from "./errors";
import {
	agentCurrentEmailContext,
	agentSystemPrompt,
	getAgentModel,
} from "./model";
import { getAgentEnabled } from "./provider";
import {
	EMAIL_TOOL_NAMES,
	emailToolDescriptions,
	emailToolSchemas,
	runEmailTool,
} from "./tools";
import type { AgentToolContext } from "./types";

export async function getAgentConversation(
	context: AgentToolContext,
	conversationId: string
) {
	const db = getDb(context.env);
	const [conversation] = await db
		.select()
		.from(agentConversations)
		.where(
			and(
				eq(agentConversations.id, conversationId),
				eq(agentConversations.userId, context.user.id),
				eq(agentConversations.mailboxId, context.mailboxId)
			)
		)
		.limit(1);
	return conversation ?? null;
}

export async function listAgentConversations(context: AgentToolContext) {
	const db = getDb(context.env);
	const access = await getMailboxAccessLevel(
		db,
		context.user,
		context.mailboxId
	);
	if (!access?.canRead) {
		throw new Error("Mailbox not found");
	}
	return db
		.select()
		.from(agentConversations)
		.where(
			and(
				eq(agentConversations.userId, context.user.id),
				eq(agentConversations.mailboxId, context.mailboxId)
			)
		)
		.orderBy(desc(agentConversations.updatedAt))
		.limit(30);
}

export async function getAgentChatHistory(
	context: AgentToolContext,
	conversationId: string
) {
	if (!(await getAgentConversation(context, conversationId))) {
		throw new Error("Conversation not found");
	}
	return getDb(context.env)
		.select()
		.from(agentChatMessages)
		.where(eq(agentChatMessages.conversationId, conversationId))
		.orderBy(asc(agentChatMessages.createdAt))
		.limit(200);
}

export async function createAgentChatStream(
	inputContext: AgentToolContext,
	text: string,
	conversationId?: string,
	signal?: AbortSignal,
	requestedTimeZone?: string,
	currentMessageId?: string
) {
	const timeZone = normalizeTimeZone(
		requestedTimeZone ?? inputContext.timeZone
	);
	const context = { ...inputContext, timeZone };
	const db = getDb(context.env);
	const access = await getMailboxAccessLevel(
		db,
		context.user,
		context.mailboxId
	);
	if (!access?.canRead) {
		throw new Error("Mailbox not found");
	}
	if (!(await getAgentEnabled(context.env))) {
		throw new Error("Assistant is disabled");
	}
	const [settings] = await db
		.select()
		.from(mailboxAgentSettings)
		.where(eq(mailboxAgentSettings.mailboxId, context.mailboxId))
		.limit(1);
	const selection = await getAgentModel(context.env, settings?.modelId);
	if (!selection) {
		throw new Error("AI provider is not configured");
	}
	// Ignored unless it is in this mailbox and visible to the user, matching get_email.
	const [current] = currentMessageId
		? await db
				.select({
					id: messages.id,
					status: messages.status,
					userId: messages.userId,
				})
				.from(messages)
				.where(
					and(
						eq(messages.id, currentMessageId),
						eq(messages.mailboxId, context.mailboxId)
					)
				)
				.limit(1)
		: [];
	const openEmailId =
		current &&
		(current.status !== "draft" || current.userId === context.user.id)
			? current.id
			: null;
	let conversation = conversationId
		? await getAgentConversation(context, conversationId)
		: null;
	if (conversationId && !conversation) {
		throw new Error("Conversation not found");
	}
	if (!conversation) {
		const id = newId("conv");
		await db.insert(agentConversations).values({
			id,
			mailboxId: context.mailboxId,
			title: text.slice(0, 80),
			userId: context.user.id,
		});
		conversation = await getAgentConversation(context, id);
	}
	if (!conversation) {
		throw new Error("Cannot create conversation");
	}
	const history = await db
		.select()
		.from(agentChatMessages)
		.where(eq(agentChatMessages.conversationId, conversation.id))
		.orderBy(desc(agentChatMessages.createdAt))
		.limit(30);
	await db.insert(agentChatMessages).values({
		content: text,
		conversationId: conversation.id,
		id: newId("chat"),
		role: "user",
	});
	const prompt = history
		.toReversed()
		.filter((row) => row.role === "user" || row.role === "assistant")
		.map((row) => ({
			content: row.content,
			role: row.role as "user" | "assistant",
		}));
	// Sent with the latest turn rather than the system prompt so it outweighs emails named earlier in the history; never stored.
	prompt.push({
		content: openEmailId
			? `${text}\n\n(${agentCurrentEmailContext(openEmailId)})`
			: text,
		role: "user",
	});
	const tools = Object.fromEntries(
		EMAIL_TOOL_NAMES.map((name) => [
			name,
			{
				description: emailToolDescriptions[name],
				execute: async (input: unknown) =>
					await runEmailTool(context, name, input),
				inputSchema: emailToolSchemas[name],
			},
		])
	);
	const calendarTools = Object.fromEntries(
		CALENDAR_TOOL_NAMES.map((name) => [
			name,
			{
				description: calendarToolDescriptions[name],
				execute: async (input: unknown) =>
					await runCalendarTool(context, name, input),
				inputSchema: calendarToolSchemas[name],
			},
		])
	);
	const result = streamText({
		abortSignal: signal,
		maxOutputTokens: 1200,
		messages: prompt,
		model: selection.model,
		onStepFinish: async ({ usage }) => {
			await recordAiUsage({
				details: selection,
				env: context.env,
				source: "chat",
				usage,
			});
		},
		stopWhen: stepCountIs(7),
		system: agentSystemPrompt(settings?.instructions ?? "", timeZone),
		tools: { ...tools, ...calendarTools },
	});
	const encoder = new TextEncoder();
	const { id } = conversation;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let response = "";
			let stepText = "";
			let reasoning = "";
			const emit = (event: unknown) =>
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			emit({ conversationId: id, type: "conversation" });
			try {
				for await (const part of result.fullStream) {
					// oxlint-disable-next-line shadcn/no-raw-colors -- This string is a CSS property or streaming protocol event identifier, not a theme color.
					if (part.type === "text-delta") {
						response += part.text;
						stepText += part.text;
						emit({ text: part.text, type: "text" });
					} else if (part.type === "reasoning-delta") {
						reasoning += part.text;
						emit({ text: part.text, type: "reasoning" });
					} else if (part.type === "finish-step") {
						if (part.finishReason === "tool-calls" && stepText) {
							response = response.slice(0, -stepText.length);
							reasoning += stepText;
							emit({ text: stepText, type: "reclassify" });
						}
						stepText = "";
					} else if (part.type === "tool-call") {
						emit({
							id: part.toolCallId,
							name: part.toolName,
							state: "running",
							type: "tool",
						});
					} else if (part.type === "tool-result") {
						const recordId = newId("chat");
						await db.insert(agentChatMessages).values({
							content: (JSON.stringify(part.output) ?? "null").slice(0, 12_000),
							conversationId: id,
							id: recordId,
							role: "tool",
							toolName: part.toolName,
						});
						emit({
							id: part.toolCallId,
							name: part.toolName,
							recordId,
							result: part.output,
							state: "complete",
							type: "tool",
						});
					} else if (part.type === "tool-error") {
						const message = agentProviderErrorMessage(part.error);
						await db.insert(agentChatMessages).values({
							content: message,
							conversationId: id,
							id: newId("chat"),
							role: "tool",
							toolName: part.toolName,
						});
						emit({
							id: part.toolCallId,
							name: part.toolName,
							result: message,
							state: "failed",
							type: "tool",
						});
					} else if (part.type === "error") {
						emit({
							message: agentProviderErrorMessage(part.error),
							type: "error",
						});
					}
				}
				if (reasoning.trim()) {
					await db.insert(agentChatMessages).values({
						content: reasoning.slice(0, 20_000),
						conversationId: id,
						id: newId("chat"),
						role: "tool",
						toolName: "__reasoning__",
					});
				}
				if (response.trim()) {
					await db.insert(agentChatMessages).values({
						content: response,
						conversationId: id,
						id: newId("chat"),
						role: "assistant",
					});
				}
				await db
					.update(agentConversations)
					.set({ updatedAt: new Date() })
					.where(eq(agentConversations.id, id));
				emit({ type: "done" });
			} catch (error) {
				if (reasoning.trim()) {
					await db.insert(agentChatMessages).values({
						content: reasoning.slice(0, 20_000),
						conversationId: id,
						id: newId("chat"),
						role: "tool",
						toolName: "__reasoning__",
					});
				}
				if (response.trim()) {
					await db.insert(agentChatMessages).values({
						content: response,
						conversationId: id,
						id: newId("chat"),
						role: "assistant",
					});
				}
				emit({ message: agentProviderErrorMessage(error), type: "error" });
			} finally {
				controller.close();
			}
		},
	});
	return { conversationId: id, stream };
}
