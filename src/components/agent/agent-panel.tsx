"use client";

import {
	ArrowLeft,
	FileText,
	ListChecks,
	LoaderCircle,
	Maximize2,
	Minimize2,
	Pause,
	PenLine,
	Plus,
	Send,
	Settings2,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { useCompose } from "@/components/compose/compose-context";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { withCleanup, requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { fetchCachedMessageDetail } from "@/lib/messages/detail-cache";
import { usePathname } from "@/lib/navigation";
import { getUserTimeZone } from "@/lib/time/utils";

import { AgentTurnView } from "./agent-turn";
import { approveAgentAction, requestDraftReview } from "./client-actions";
import { ConversationSkeleton } from "./conversation-skeleton";
import { QueuedAgentMessages } from "./queued-messages";
import { SendReview } from "./send-review";
import type { ReviewSnapshot } from "./send-review-types";
import type {
	AgentConversation,
	AgentConversationsResponse,
	AgentErrorResponse,
	AgentEvent,
	AgentHistoryResponse,
	AgentJob,
	AgentJobsResponse,
	AgentMessage,
	AgentPanelProps,
	AgentPanelView,
	AgentSettings,
	AgentSettingsResponse,
	QueuedAgentMessage,
} from "./types";
import {
	activeAgentTool,
	activeAgentToolLabel,
	appendAgentReasoning,
	consumeAgentStream,
	editQueuedAgentMessage,
	enqueueAgentMessage,
	groupAgentMessages,
	isAgentScrollAtBottom,
	markAgentDraftSent,
	normalizeAgentHistory,
	readAgentConversationId,
	removeQueuedAgentMessage,
	resizeAgentInput,
	saveAgentConversationId,
	shouldSubmitAgentInput,
	steerQueuedAgentMessage,
	uniqueAgentDraftActions,
} from "./utils";

function toolResultState(
	tool: Extract<AgentEvent, { type: "tool" }>
): AgentMessage["toolState"] {
	if (tool.state === "running") {
		return "running";
	}
	if (tool.state === "failed") {
		return "failed";
	}
	return "used";
}
function toolResultContent(tool: Extract<AgentEvent, { type: "tool" }>) {
	if (tool.state === "running") {
		return "";
	}
	if (typeof tool.result === "string") {
		return tool.result;
	}
	return JSON.stringify(tool.result) ?? "";
}

function AgentPanelSession({
	open,
	fullSize,
	onClose,
	onToggleFullSize,
	input,
	setInput,
}: AgentPanelProps & {
	input: string;
	setInput: React.Dispatch<React.SetStateAction<string>>;
}) {
	const { t } = useLanguage();
	const isMobile = useIsMobile();
	const { selectedMailbox } = useSelectedMailbox();
	const pathname = usePathname();
	const { openDraftComposer } = useCompose();
	// On phones the assistant is a modal sheet; close it so the composer is not trapped behind it.
	const openDraft = (draftId: string) => {
		if (isMobile) {
			onClose();
		}
		openDraftComposer(draftId);
	};
	const [view, setView] = useState<AgentPanelView>("chat");
	const [settings, setSettings] = useState<AgentSettings | null>(null);
	const [availableModels, setAvailableModels] = useState<string[]>([]);
	const [reviewers, setReviewers] = useState<
		{ id: string; name: string; email: string }[]
	>([]);
	const [canManage, setCanManage] = useState(false);
	const [providerConfigured, setProviderConfigured] = useState(false);
	const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [deletingConversationId, setDeletingConversationId] = useState<
		string | null
	>(null);
	const [conversations, setConversations] = useState<AgentConversation[]>([]);
	const [messages, setMessages] = useState<AgentMessage[]>([]);
	const [loadingConversation, setLoadingConversation] = useState(() =>
		Boolean(
			open && selectedMailbox?.id && readAgentConversationId(selectedMailbox.id)
		)
	);
	const [jobs, setJobs] = useState<AgentJob[]>([]);
	const [queuedMessages, setQueuedMessages] = useState<QueuedAgentMessage[]>(
		[]
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [approvingId, setApprovingId] = useState<string | null>(null);
	const [draftReview, setDraftReview] = useState<{
		approvalId: string;
		snapshot: ReviewSnapshot;
		draftId: string;
	} | null>(null);
	const abort = useRef<AbortController | null>(null);
	const queuedMessagesRef = useRef<QueuedAgentMessage[]>([]);
	const runningRef = useRef(false);
	const queueGenerationRef = useRef(0);
	const [menuOpen, setMenuOpen] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	const stickToBottomRef = useRef(true);
	const selectedConversationRef = useRef<string | null>(null);
	const mailboxId = selectedMailbox?.id;
	const selectedMessageId =
		pathname.match(
			/^\/(?:inbox|sent|archived|spam|trash|starred|snoozed|folders\/[^/]+)\/(?<messageId>[^/]+)/u
		)?.groups?.messageId ?? null;
	const [openEmailSubjects, setOpenEmailSubjects] = useState<
		Record<string, string>
	>({});
	const [dismissedMessageId, setDismissedMessageId] = useState<string | null>(
		null
	);
	const openEmailId =
		selectedMessageId &&
		selectedMessageId in openEmailSubjects &&
		selectedMessageId !== dismissedMessageId
			? selectedMessageId
			: null;
	const openEmailIdRef = useRef<string | null>(null);
	const welcomePrompts = selectedMessageId
		? [
				{
					detail: t("agent.welcome.sumThisDetail"),
					icon: FileText,
					label: t("agent.welcome.sumThis"),
					prompt: `Read the thread containing email ${selectedMessageId} and summarize its key points.`,
				},
				{
					detail: t("agent.welcome.replyDetail"),
					icon: PenLine,
					label: t("agent.welcome.reply"),
					prompt: `Read the thread containing email ${selectedMessageId} and draft a reply.`,
				},
				{
					detail: t("agent.welcome.actionsThisDetail"),
					icon: ListChecks,
					label: t("agent.welcome.actionsThis"),
					prompt: `Read the thread containing email ${selectedMessageId} and list the action items.`,
				},
			]
		: [
				{
					detail: t("agent.welcome.sumRecentDetail"),
					icon: FileText,
					label: t("agent.welcome.sumRecent"),
					prompt: "Summarize my recent email in this mailbox.",
				},
				{
					detail: t("agent.welcome.replyDetail"),
					icon: PenLine,
					label: t("agent.welcome.reply"),
					prompt: "Read my latest email and draft a reply.",
				},
				{
					detail: t("agent.welcome.actionsDetail"),
					icon: ListChecks,
					label: t("agent.welcome.actions"),
					prompt: "Find action items in my recent email.",
				},
			];

	const refresh = useCallback(async () => {
		if (!mailboxId) {
			return;
		}
		const [settingsResponse, conversationsResponse, jobsResponse] =
			await Promise.all([
				authFetch(
					`/api/agent/settings?mailboxId=${encodeURIComponent(mailboxId)}`
				),
				authFetch(
					`/api/agent/conversations?mailboxId=${encodeURIComponent(mailboxId)}`
				),
				authFetch(`/api/agent/jobs?mailboxId=${encodeURIComponent(mailboxId)}`),
			]);
		if (!settingsResponse.ok) {
			const data = (await settingsResponse
				.json()
				.catch(() => ({}))) as AgentErrorResponse;
			setError(data.error || t("agent.panel.settingsLoadFailed"));
			return;
		}
		if (settingsResponse.ok) {
			const data = (await settingsResponse.json()) as AgentSettingsResponse;
			setSettings(data.settings);
			setAvailableModels(data.models ?? []);
			setCanManage(data.canManage);
			setProviderConfigured(data.providerConfigured);
			setAutoReplyEnabled(data.autoReplyEnabled);
			setReviewers(data.reviewers ?? []);
		}
		if (conversationsResponse.ok) {
			setConversations(
				((await conversationsResponse.json()) as AgentConversationsResponse)
					.conversations ?? []
			);
		}
		if (jobsResponse.ok) {
			setJobs(((await jobsResponse.json()) as AgentJobsResponse).jobs ?? []);
		}
	}, [mailboxId, t]);

	useEffect(() => {
		if (!selectedMessageId || !mailboxId) {
			return;
		}
		let active = true;
		fetchCachedMessageDetail(selectedMessageId)
			.then(({ message }) => {
				if (active && message?.mailboxId === mailboxId) {
					setOpenEmailSubjects((current) => ({
						...current,
						[selectedMessageId]: message.subject ?? "",
					}));
				}

				return null;
			})
			.catch(() => {
				// No provider or recoverable background failure requires an action.
			});
		return () => {
			active = false;
		};
	}, [selectedMessageId, mailboxId]);

	// Queued messages send later, so they read the email that is open at that moment.
	useEffect(() => {
		openEmailIdRef.current = openEmailId;
	}, [openEmailId]);

	useEffect(() => {
		if (!open || !mailboxId) {
			return;
		}
		let cancelled = false;
		void (async () => {
			await refresh();
		})().catch(() => {
			if (!cancelled) {
				setError(t("agent.panel.settingsLoadFailed"));
			}
		});
		const savedId = readAgentConversationId(mailboxId);
		selectedConversationRef.current = savedId;
		if (savedId) {
			void authFetch(
				`/api/agent/conversations/${encodeURIComponent(savedId)}?mailboxId=${encodeURIComponent(mailboxId)}`
			)
				.then(async (response) => {
					if (cancelled || selectedConversationRef.current !== savedId) {
						return null;
					}
					if (!response.ok) {
						saveAgentConversationId(mailboxId, null);
						selectedConversationRef.current = null;
						setLoadingConversation(false);
						return null;
					}
					const history = (await response.json()) as AgentHistoryResponse;
					if (cancelled || selectedConversationRef.current !== savedId) {
						return null;
					}
					setConversationId(savedId);
					setMessages(normalizeAgentHistory(history.messages ?? []));

					return null;
				})
				.catch(() => {
					// No provider or recoverable background failure requires an action.
				})
				.finally(() => {
					if (!cancelled && selectedConversationRef.current === savedId) {
						setLoadingConversation(false);
					}
				});
		}
		return () => {
			cancelled = true;
			queueGenerationRef.current += 1;
			queuedMessagesRef.current = [];
			runningRef.current = false;
			abort.current?.abort();
			abort.current = null;
		};
	}, [mailboxId, open, refresh, t]);

	// Measure the committed DOM: content, sheet size and view changes can all affect it.
	useLayoutEffect(() => {
		resizeAgentInput(inputRef.current);
		const container = chatScrollRef.current;
		if (container && stickToBottomRef.current) {
			container.scrollTop = container.scrollHeight;
		}
	});

	useEffect(() => {
		function onDraft(event: Event) {
			const data = (event as CustomEvent<{ mailboxId: string }>).detail;
			if (open && data.mailboxId === mailboxId) {
				refresh();
			}
		}
		window.addEventListener("mailflare:agent-draft", onDraft);
		return () => window.removeEventListener("mailflare:agent-draft", onDraft);
	}, [mailboxId, open, refresh]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const timer = window.setInterval(() => refresh(), 30_000);
		return () => window.clearInterval(timer);
	}, [open, refresh]);

	async function selectConversation(id: string) {
		if (!mailboxId) {
			return;
		}
		abort.current?.abort();
		abort.current = null;
		runningRef.current = false;
		queueGenerationRef.current += 1;
		queuedMessagesRef.current = [];
		setQueuedMessages([]);
		setBusy(false);
		selectedConversationRef.current = id;
		stickToBottomRef.current = true;
		saveAgentConversationId(mailboxId, id);
		setConversationId(id);
		setMessages([]);
		setLoadingConversation(true);
		setView("chat");
		setMenuOpen(false);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch(
						`/api/agent/conversations/${id}?mailboxId=${encodeURIComponent(mailboxId)}`
					);
					requireSuccessfulResponse(
						response,
						t("agent.panel.conversationLoadFailed")
					);
					const history = (await response.json()) as AgentHistoryResponse;
					if (selectedConversationRef.current === id) {
						setMessages(normalizeAgentHistory(history.messages ?? []));
					}
				} catch (error_) {
					if (selectedConversationRef.current === id) {
						setError(
							error_ instanceof Error
								? error_.message
								: t("agent.panel.conversationLoadFailed")
						);
					}
				}
			},
			() => {
				if (selectedConversationRef.current === id) {
					setLoadingConversation(false);
				}
			}
		);
	}

	async function deleteConversation(id: string) {
		if (deletingConversationId) {
			return;
		}
		setDeletingConversationId(id);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch(
						`/api/agent/conversations/${encodeURIComponent(id)}`,
						{ method: "DELETE" }
					);
					requireSuccessfulResponse(
						response,
						t("agent.panel.conversationDeleteFailed")
					);
					setConversations((current) =>
						current.filter((item) => item.id !== id)
					);
					if (selectedConversationRef.current === id || conversationId === id) {
						abort.current?.abort();
						abort.current = null;
						runningRef.current = false;
						queueGenerationRef.current += 1;
						queuedMessagesRef.current = [];
						setQueuedMessages([]);
						setBusy(false);
						selectedConversationRef.current = null;
						if (mailboxId) {
							saveAgentConversationId(mailboxId, null);
						}
						setConversationId(null);
						setMessages([]);
						setLoadingConversation(false);
					}
				} catch (error_) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("agent.panel.conversationDeleteFailed")
					);
				}
			},
			() => {
				setDeletingConversationId(null);
			}
		);
	}

	async function handleSend(text: string, queued?: QueuedAgentMessage) {
		if (
			!mailboxId ||
			!text.trim() ||
			runningRef.current ||
			loadingConversation
		) {
			return;
		}
		const controller = new AbortController();
		const generation = queueGenerationRef.current;
		const userMessageId = crypto.randomUUID();
		const assistantMessageId = crypto.randomUUID();
		// oxlint-disable-next-line react/purity -- This recursive queue action runs only from user events or completion callbacks, never during render.
		const startedAt = Date.now();
		let accepted = false;
		let streamErrored = false;
		abort.current = controller;
		runningRef.current = true;
		setBusy(true);
		setError(null);
		setMessages((current) => [
			...current,
			{
				content: text,
				createdAt: new Date(startedAt).toISOString(),
				id: userMessageId,
				role: "user",
			},
			{ content: "", id: assistantMessageId, pending: true, role: "assistant" },
		]);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch("/api/agent/chat", {
						body: JSON.stringify({
							conversationId: selectedConversationRef.current ?? undefined,
							currentMessageId: openEmailIdRef.current ?? undefined,
							mailboxId,
							text,
							timeZone: getUserTimeZone(),
						}),
						headers: { "Content-Type": "application/json" },
						method: "POST",
						signal: controller.signal,
					});
					if (!response.ok) {
						requireSuccessfulResponse(
							response,
							((await response.json()) as AgentErrorResponse).error ||
								t("agent.panel.unavailable")
						);
					}
					accepted = true;
					const responseConversationId =
						response.headers.get("X-Conversation-Id");
					if (
						responseConversationId &&
						generation === queueGenerationRef.current
					) {
						selectedConversationRef.current = responseConversationId;
						saveAgentConversationId(mailboxId, responseConversationId);
						setConversationId(responseConversationId);
					}
					await consumeAgentStream(response, (event: AgentEvent) => {
						if (generation !== queueGenerationRef.current) {
							return;
						}
						if (event.type === "conversation") {
							selectedConversationRef.current = event.conversationId;
							saveAgentConversationId(mailboxId, event.conversationId);
							setConversationId(event.conversationId);
						}
						if (event.type === "text") {
							setMessages((current) =>
								current.map((item) =>
									item.id === assistantMessageId
										? { ...item, content: item.content + event.text }
										: item
								)
							);
						}
						if (event.type === "reasoning") {
							setMessages((current) =>
								appendAgentReasoning(current, assistantMessageId, event.text)
							);
						}
						if (event.type === "reclassify") {
							setMessages((current) =>
								appendAgentReasoning(
									current,
									assistantMessageId,
									event.text,
									true
								)
							);
						}
						if (event.type === "tool") {
							const toolId = `${assistantMessageId}:tool:${event.id}`;
							const content = toolResultContent(event);
							const toolState = toolResultState(event);
							setMessages((current) =>
								current.some((item) => item.id === toolId)
									? current.map((item) =>
											item.id === toolId
												? {
														...item,
														content,
														recordId: event.recordId,
														toolState,
													}
												: item
										)
									: [
											...current,
											{
												content,
												id: toolId,
												recordId: event.recordId,
												role: "tool",
												toolName: event.name,
												toolState,
											},
										]
							);
						}
						if (event.type === "error") {
							streamErrored = true;
							setError(event.message);
						}
					});
					if (generation === queueGenerationRef.current) {
						setMessages((current) =>
							current.map((item) =>
								item.id === assistantMessageId
									? {
											...item,
											createdAt: new Date().toISOString(),
											durationMs: Date.now() - startedAt,
											pending: false,
										}
									: item
							)
						);
						refresh();
					}
				} catch (error_) {
					if (generation !== queueGenerationRef.current) {
						return;
					}
					if (accepted) {
						setMessages((current) =>
							current.map((item) =>
								item.id === assistantMessageId
									? {
											...item,
											createdAt: new Date().toISOString(),
											durationMs: Date.now() - startedAt,
											pending: false,
										}
									: item
							)
						);
					} else {
						setMessages((current) =>
							current.filter(
								(item) =>
									item.id !== userMessageId && item.id !== assistantMessageId
							)
						);
						if (
							!controller.signal.aborted &&
							generation === queueGenerationRef.current
						) {
							if (queued) {
								queuedMessagesRef.current = [
									queued,
									...queuedMessagesRef.current,
								];
								setQueuedMessages(queuedMessagesRef.current);
							} else {
								setInput((current) => current || text);
							}
						}
					}
					if (!controller.signal.aborted) {
						setError(
							error_ instanceof Error ? error_.message : t("agent.panel.failed")
						);
					}
					streamErrored = !controller.signal.aborted;
				}
			},
			() => {
				if (abort.current !== controller) {
					return;
				}
				abort.current = null;
				runningRef.current = false;
				setBusy(false);
				if (
					generation === queueGenerationRef.current &&
					!streamErrored &&
					queuedMessagesRef.current.length
				) {
					const [next, ...remaining] = queuedMessagesRef.current;
					queuedMessagesRef.current = remaining;
					setQueuedMessages(remaining);
					handleSend(next.text, next);
				}
			}
		);
	}

	function submitMessage(text: string) {
		if (
			!mailboxId ||
			!text.trim() ||
			!settings ||
			!providerConfigured ||
			loadingConversation
		) {
			return;
		}
		setInput("");
		if (runningRef.current || queuedMessagesRef.current.length) {
			queuedMessagesRef.current = enqueueAgentMessage(
				queuedMessagesRef.current,
				text
			);
			setQueuedMessages(queuedMessagesRef.current);
			if (!runningRef.current) {
				const [next, ...remaining] = queuedMessagesRef.current;
				queuedMessagesRef.current = remaining;
				setQueuedMessages(remaining);
				handleSend(next.text, next);
			}
			return;
		}
		handleSend(text.trim());
	}

	async function saveSettings() {
		if (!settings) {
			return;
		}
		setBusy(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch("/api/agent/settings", {
						body: JSON.stringify(settings),
						headers: { "Content-Type": "application/json" },
						method: "PUT",
					});
					if (!response.ok) {
						requireSuccessfulResponse(
							response,
							((await response.json()) as AgentErrorResponse).error ||
								t("agent.panel.saveFailed")
						);
					}
					await refresh();
				} catch (error_) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("agent.panel.saveFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}

	async function retryJob(id: string) {
		const response = await authFetch(`/api/agent/jobs/${id}/retry`, {
			method: "POST",
		});
		if (response.ok) {
			await refresh();
		} else {
			setError(
				((await response.json()) as AgentErrorResponse).error ||
					t("agent.panel.retryFailed")
			);
		}
	}

	async function discardJobDraft(draftId: string) {
		const response = await authFetch(
			`/api/drafts/${encodeURIComponent(draftId)}`,
			{ method: "DELETE" }
		);
		if (response.ok) {
			await refresh();
		} else {
			setError(
				((await response.json()) as AgentErrorResponse).error ||
					t("agent.panel.discardFailed")
			);
		}
	}

	async function startDraftReview(draftId: string, revision: number) {
		setApprovingId(draftId);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					setDraftReview({
						...(await requestDraftReview(draftId, revision)),
						draftId,
					});
				} catch (error_) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("agent.panel.reviewFailed")
					);
				}
			},
			() => {
				setApprovingId(null);
			}
		);
	}

	async function confirmAction(item: AgentMessage) {
		const { recordId } = item;
		if (!recordId) {
			return;
		}
		setApprovingId(item.id);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const result = await approveAgentAction(recordId);
					setMessages((current) =>
						current.map((message) =>
							message.id === item.id
								? { ...message, content: JSON.stringify(result) }
								: message
						)
					);
					window.dispatchEvent(new Event("mailflare:messages-changed"));
				} catch (error_) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("agent.panel.approveFailed")
					);
				}
			},
			() => {
				setApprovingId(null);
			}
		);
	}

	const draftActions = uniqueAgentDraftActions(messages);
	const activeTool = busy ? activeAgentTool(messages) : null;
	function renderPanelHeader() {
		return (
			<header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pr-2 pl-4">
				<div className="flex min-w-0 items-center gap-2.5">
					{view === "settings" ? (
						<Button
							variant="ghost"
							size="icon-sm"
							type="button"
							className="-ml-2 text-muted-foreground"
							onClick={() => setView("chat")}
							aria-label={t("agent.panel.backToAssistant")}
							title={t("agent.panel.backToAssistant")}
						>
							<ArrowLeft data-icon="inline-start" />
						</Button>
					) : (
						<Sparkles
							className="size-5 shrink-0 fill-signal/20 text-signal/70"
							aria-hidden="true"
						/>
					)}
					<div className="min-w-0">
						<strong className="block truncate text-sm font-semibold">
							{view === "settings"
								? t("agent.panel.settings")
								: t("agent.panel.assistant")}
						</strong>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("agent.panel.menuLabel")}
								/>
							}
						>
							<Settings2 data-icon="inline-start" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-72">
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={() => {
										abort.current?.abort();
										abort.current = null;
										runningRef.current = false;
										queueGenerationRef.current += 1;
										queuedMessagesRef.current = [];
										setQueuedMessages([]);
										setBusy(false);
										selectedConversationRef.current = null;
										stickToBottomRef.current = true;
										if (mailboxId) {
											saveAgentConversationId(mailboxId, null);
										}
										setConversationId(null);
										setMessages([]);
										setLoadingConversation(false);
										setInput("");
										setView("chat");
									}}
								>
									<Plus />
									{t("agent.panel.newChat")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuLabel>
									{t("agent.panel.previousChats")}
								</DropdownMenuLabel>
								{conversations.length ? (
									<div className="max-h-64 overflow-y-auto">
										{conversations.map((item) => (
											<div key={item.id} className="flex items-center gap-1">
												<DropdownMenuItem
													className="min-w-0 flex-1"
													onClick={() => selectConversation(item.id)}
												>
													<span className="truncate">{item.title}</span>
												</DropdownMenuItem>
												<Button
													variant="ghost"
													size="icon"
													aria-label={t("agent.panel.deleteChatLabel", {
														title: item.title,
													})}
													disabled={deletingConversationId !== null}
													onClick={() => deleteConversation(item.id)}
												>
													<Trash2 data-icon="inline-start" />
												</Button>
											</div>
										))}
									</div>
								) : (
									<p className="px-2 py-3 text-sm text-muted-foreground">
										{t("agent.panel.noChats")}
									</p>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() =>
										setView((current) =>
											current === "settings" ? "chat" : "settings"
										)
									}
								>
									<Settings2 />
									{view === "settings"
										? t("agent.panel.backToChat")
										: t("agent.panel.settings")}
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						className="text-muted-foreground"
						onClick={onToggleFullSize}
						aria-label={
							fullSize ? t("agent.panel.exitFull") : t("agent.panel.expandFull")
						}
						aria-pressed={fullSize}
						title={
							fullSize
								? t("agent.panel.exitFullTitle")
								: t("agent.panel.fullTitle")
						}
					>
						{fullSize ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						className="text-muted-foreground"
						onClick={onClose}
						aria-label={t("agent.panel.close")}
					>
						<X data-icon="inline-start" />
					</Button>
				</div>
			</header>
		);
	}
	function renderConversation() {
		return (
			<ScrollArea
				ref={(node) => {
					chatScrollRef.current =
						node?.querySelector<HTMLDivElement>(
							'[data-slot="scroll-area-viewport"]'
						) ?? null;
				}}
				onScrollCapture={() => {
					if (chatScrollRef.current) {
						stickToBottomRef.current = isAgentScrollAtBottom(
							chatScrollRef.current
						);
					}
				}}
				className="flex-1 [&_[data-slot=scroll-area-viewport]]:overscroll-contain"
			>
				<div className="px-4 py-5 text-sm sm:px-5">
					<div className="mx-auto flex max-w-3xl flex-col gap-5">
						{settings && !providerConfigured && (
							<Alert variant="warning" aria-live="polite">
								<AlertDescription>
									{t("agent.panel.configureProvider")}
								</AlertDescription>
							</Alert>
						)}
						{loadingConversation && <ConversationSkeleton />}
						{!loadingConversation && messages.length === 0 && settings && (
							<div className="pt-3">
								<p className="mt-1 leading-tight font-medium text-foreground">
									{t("agent.panel.welcome")}
								</p>
								<div className="mt-7 flex flex-col gap-2">
									{welcomePrompts.map((item) => {
										const Icon = item.icon;
										return (
											<Button
												variant="secondary"
												key={item.label}
												type="button"
												size="none"
												className="w-full justify-start text-left whitespace-normal"
												disabled={!providerConfigured || busy}
												onClick={() => submitMessage(item.prompt)}
											>
												<span className="flex w-full items-center gap-3 p-3">
													<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card text-foreground">
														<Icon size={18} />
													</span>
													<span className="min-w-0">
														<span className="block font-medium text-foreground">
															{item.label}
														</span>
														<span className="block text-xs text-muted-foreground">
															{item.detail}
														</span>
													</span>
												</span>
											</Button>
										);
									})}
								</div>
							</div>
						)}
						{groupAgentMessages(messages).map((turn) => (
							<AgentTurnView
								key={turn.id}
								turn={turn}
								draftActions={draftActions}
								onOpenDraft={openDraft}
								onApproveDraft={(draftId, revision) =>
									startDraftReview(draftId, revision)
								}
								onApproveAction={(item) => confirmAction(item)}
								approvingId={approvingId}
							/>
						))}
						{jobs
							.filter((job) => job.status === "completed" && job.draftId)
							.slice(0, 5)
							.map((job) => (
								<div
									key={job.id}
									className="rounded-lg border border-border bg-card p-3"
								>
									<p>{t("agent.panel.autoDraftReady")}</p>
									<div className="mt-2 flex gap-3 text-signal">
										<Button
											variant="ghost"
											size="sm"
											type="button"
											onClick={() => job.draftId && openDraft(job.draftId)}
										>
											{t("agent.panel.openDraft")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											type="button"
											disabled={busy}
											onClick={() =>
												submitMessage(
													`Read the thread containing email ${job.sourceMessageId} and draft another reply. Preserve the existing draft.`
												)
											}
										>
											{t("agent.panel.regenerate")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											type="button"
											className="text-destructive"
											onClick={() =>
												job.draftId && discardJobDraft(job.draftId)
											}
										>
											{t("agent.panel.discard")}
										</Button>
									</div>
								</div>
							))}
					</div>
				</div>
			</ScrollArea>
		);
	}
	function renderChatComposer() {
		return (
			<form
				className="relative mx-auto w-full max-w-3xl px-3 pb-safe-2"
				onSubmit={(event) => {
					event.preventDefault();
					submitMessage(input);
				}}
			>
				<Textarea
					ref={inputRef}
					enterKeyHint="send"
					rows={1}
					className="block w-full resize-none px-4 py-3 pr-20"
					value={input}
					onChange={(event) => setInput(event.target.value)}
					onKeyDown={(event) => {
						if (!shouldSubmitAgentInput(event)) {
							return;
						}
						event.preventDefault();
						if (
							input.trim() &&
							settings &&
							providerConfigured &&
							!loadingConversation
						) {
							event.currentTarget.form?.requestSubmit();
						}
					}}
					placeholder={t("agent.panel.promptPlaceholder")}
					name="message"
					disabled={!settings || !providerConfigured || loadingConversation}
				/>
				<div className="absolute right-4 bottom-3.5 flex justify-end gap-2">
					{busy ? (
						<Button
							type="button"
							variant="secondary"
							size="icon-sm"
							onClick={() => abort.current?.abort()}
							className="text-muted-foreground"
							aria-label={t("agent.panel.stop")}
							title={t("agent.panel.stop")}
						>
							<Pause data-icon="inline-start" />
						</Button>
					) : (
						<Button
							type="submit"
							variant="ghost"
							size="icon-sm"
							disabled={
								!input.trim() ||
								!settings ||
								!providerConfigured ||
								loadingConversation
							}
							aria-label={t("agent.panel.send")}
							title={t("agent.panel.send")}
						>
							<Send data-icon="inline-start" />
						</Button>
					)}
				</div>
			</form>
		);
	}
	function renderAgentSettings() {
		return (
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 text-sm">
				{!canManage && <p>{t("agent.panel.needPermission")}</p>}
				{settings && (
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="assistant-reviewer">
								{t("agent.panel.reviewer")}
							</FieldLabel>
							<NativeSelect
								id="assistant-reviewer"
								className="w-full"
								value={settings.reviewerUserId ?? ""}
								disabled={!canManage}
								onChange={(event) =>
									setSettings({
										...settings,
										reviewerUserId: event.target.value,
									})
								}
							>
								{reviewers.map((reviewer) => (
									<option key={reviewer.id} value={reviewer.id}>
										{reviewer.name} ({reviewer.email})
									</option>
								))}
							</NativeSelect>
						</Field>
						<Field>
							<FieldLabel htmlFor="assistant-model">
								{t("agent.panel.model")}
							</FieldLabel>
							<NativeSelect
								id="assistant-model"
								className="w-full"
								value={settings.modelId ?? ""}
								disabled={!canManage || !availableModels.length}
								onChange={(event) =>
									setSettings({ ...settings, modelId: event.target.value })
								}
							>
								{!availableModels.length && (
									<option value="">{t("agent.panel.noModels")}</option>
								)}
								{availableModels.map((model) => (
									<option key={model} value={model}>
										{model}
									</option>
								))}
							</NativeSelect>
						</Field>
						<div className="flex items-center justify-between gap-3">
							<span>{t("agent.panel.autoDraft")}</span>
							<Switch
								checked={settings.autoDraftEnabled}
								disabled={!canManage || autoReplyEnabled}
								onCheckedChange={(checked) =>
									setSettings({ ...settings, autoDraftEnabled: checked })
								}
								aria-label={t("agent.panel.autoDraft")}
							/>
						</div>
						{autoReplyEnabled && (
							<p className="text-warning">{t("agent.panel.disableOoo")}</p>
						)}
						<Field>
							<FieldLabel htmlFor="assistant-instructions">
								{t("agent.panel.instructions")}
							</FieldLabel>
							<Textarea
								id="assistant-instructions"
								value={settings.instructions}
								disabled={!canManage}
								onChange={(event) =>
									setSettings({
										...settings,
										instructions: event.target.value,
									})
								}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="assistant-dailyLimit">
								{t("agent.panel.dailyLimit")}
							</FieldLabel>
							<Input
								id="assistant-dailyLimit"
								className="w-full"
								type="number"
								min="1"
								max="100"
								value={settings.dailyLimit}
								disabled={!canManage}
								onChange={(event) =>
									setSettings({
										...settings,
										dailyLimit: Number(event.target.value),
									})
								}
							/>
						</Field>
						<Button
							type="button"
							size="sm"
							disabled={!canManage || busy}
							onClick={() => saveSettings()}
						>
							{t("agent.panel.save")}
						</Button>
					</FieldGroup>
				)}
				<p className="text-xs text-muted-foreground">
					{t("agent.panel.privacy")}
				</p>
				{jobs
					.filter((job) => job.status === "failed" || job.status === "skipped")
					.slice(0, 5)
					.map((job) => (
						<p key={job.id} className="text-xs">
							{job.status}: {job.reason}
							{job.status === "failed" && (
								<Button
									variant="link"
									size="sm"
									type="button"
									className="ml-2"
									onClick={() => retryJob(job.id)}
								>
									{t("agent.panel.retry")}
								</Button>
							)}
						</p>
					))}
			</div>
		);
	}

	const panel = (
		<section
			id="email-assistant-panel"
			className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground max-md:rounded-b-none max-md:border-0 max-md:shadow-none"
			aria-label={t("agent.panel.label")}
		>
			{renderPanelHeader()}
			{error && (
				<Alert variant="error" className="mx-4 mt-3 w-auto break-words">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{view === "chat" && (
				<>
					{renderConversation()}
					<QueuedAgentMessages
						messages={queuedMessages}
						running={busy}
						onRemove={(id) => {
							queuedMessagesRef.current = removeQueuedAgentMessage(
								queuedMessagesRef.current,
								id
							);
							setQueuedMessages(queuedMessagesRef.current);
						}}
						onEdit={(id, text) => {
							queuedMessagesRef.current = editQueuedAgentMessage(
								queuedMessagesRef.current,
								id,
								text
							);
							setQueuedMessages(queuedMessagesRef.current);
						}}
						onSteer={(id) => {
							queuedMessagesRef.current = steerQueuedAgentMessage(
								queuedMessagesRef.current,
								id
							);
							setQueuedMessages(queuedMessagesRef.current);
							if (runningRef.current) {
								abort.current?.abort();
							} else {
								const [next, ...remaining] = queuedMessagesRef.current;
								if (next) {
									queuedMessagesRef.current = remaining;
									setQueuedMessages(remaining);
									handleSend(next.text, next);
								}
							}
						}}
					/>
					{busy && (
						<output
							aria-live="polite"
							className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-5 py-2 text-sm text-muted-foreground"
						>
							{activeTool && (
								<div className="flex items-center gap-2">
									<LoaderCircle
										size={14}
										className="shrink-0 animate-spin"
										aria-hidden="true"
									/>
									<span>{activeAgentToolLabel(activeTool.toolName, t)}</span>
								</div>
							)}
							<div className="flex items-center gap-2">
								<LoaderCircle
									size={14}
									className="shrink-0 animate-spin"
									aria-hidden="true"
								/>
								<span>{t("agent.panel.working")}</span>
							</div>
						</output>
					)}
					{openEmailId && (
						<div className="mx-auto flex w-full max-w-3xl px-4 pb-1.5">
							<Badge
								variant="secondary"

								className="max-w-full"
							>
								<FileText size={12} className="shrink-0" aria-hidden="true" />
								<span className="truncate">
									{t("agent.panel.currentEmail", {
										subject:
											openEmailSubjects[openEmailId] || t("list.noSubject"),
									})}
								</span>
								<Button
									variant="ghost"
									size="icon-xs"
									type="button"
									onClick={() => setDismissedMessageId(openEmailId)}
									className="shrink-0"
									aria-label={t("agent.panel.removeCurrentEmail")}
									title={t("agent.panel.removeCurrentEmail")}
								>
									<X data-icon="inline-start" aria-hidden="true" />
								</Button>
							</Badge>
						</div>
					)}
					{renderChatComposer()}
				</>
			)}
			{view === "settings" && renderAgentSettings()}
			{draftReview && (
				<SendReview
					approvalId={draftReview.approvalId}
					snapshot={draftReview.snapshot}
					onClose={() => setDraftReview(null)}
					onSent={() => {
						setMessages((current) =>
							markAgentDraftSent(current, draftReview.draftId)
						);
						setDraftReview(null);
						refresh();
					}}
				/>
			)}
		</section>
	);

	return isMobile ? (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onClose();
				}
			}}
		>
			<SheetContent
				side="bottom"
				showCloseButton={false}
				aria-describedby={undefined}
				className="h-dvh"
			>
				<SheetTitle className="sr-only">
					{t("agent.panel.assistant")}
				</SheetTitle>
				{panel}
			</SheetContent>
		</Sheet>
	) : (
		panel
	);
}

export function AgentPanel(props: AgentPanelProps) {
	const { selectedMailbox } = useSelectedMailbox();
	const [input, setInput] = useState("");
	return (
		<AgentPanelSession
			key={`${selectedMailbox?.id ?? ""}:${props.open}`}
			{...props}
			input={input}
			setInput={setInput}
		/>
	);
}
