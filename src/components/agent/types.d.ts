export type AgentEvent =
	| { type: "conversation"; conversationId: string }
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "reclassify"; text: string }
	| {
			type: "tool";
			id: string;
			name: string;
			state: "running" | "complete" | "failed";
			result?: unknown;
			recordId?: string;
	  }
	| { type: "error"; message: string }
	| { type: "done" };

export interface AgentMessage {
	id: string;
	role: "user" | "assistant" | "system" | "tool" | "reasoning";
	content: string;
	toolName?: string | null;
	toolState?: "running" | "used" | "failed";
	recordId?: string;
	createdAt?: string;
	durationMs?: number;
	pending?: boolean;
}
export interface AgentEmailReference {
	id: string;
	subject?: string | null;
	status?: string;
	from?: string;
	snippet?: string;
	url?: string;
}
export interface AgentEmailLinkProps {
	email: AgentEmailReference;
	className: string;
}
export interface AgentActionProposal {
	action: "move_email" | "move_emails" | "mark_email_read" | "discard_draft";
	status: "pending_approval" | "processing" | "approved";
	emailId?: string;
	emailIds?: string[];
	destination?: string;
	read?: boolean;
	draftId?: string;
	expectedRevision?: number;
	emails?: AgentEmailReference[];
}
export interface AgentTurn {
	id: string;
	user: AgentMessage | null;
	assistant: AgentMessage | null;
	activity: AgentMessage[];
	durationMs: number | null;
	running: boolean;
}
export interface AgentDraftAction {
	messageId: string;
	draftId: string;
	revision: number;
	scheduledAt: string | null;
}
export interface AgentTurnProps {
	turn: AgentTurn;
	draftActions: AgentDraftAction[];
	onOpenDraft: (draftId: string) => void;
	onApproveDraft: (draftId: string, revision: number) => void;
	onApproveAction: (item: AgentMessage) => void;
	approvingId: string | null;
}

export interface AgentSettings {
	mailboxId: string;
	enabled: boolean;
	modelId: string | null;
	autoDraftEnabled: boolean;
	reviewerUserId: string | null;
	instructions: string;
	dailyLimit: number;
}

export interface AgentPanelProps {
	open: boolean;
	fullSize: boolean;
	onClose: () => void;
	onToggleFullSize: () => void;
}
export interface QueuedAgentMessage {
	id: string;
	text: string;
}
export interface QueuedAgentMessagesProps {
	messages: QueuedAgentMessage[];
	running: boolean;
	onRemove: (id: string) => void;
	onEdit: (id: string, text: string) => void;
	onSteer: (id: string) => void;
}

export type AgentPanelView = "chat" | "settings";
export interface AgentConversation {
	id: string;
	title: string;
}
export interface AgentJob {
	id: string;
	status: string;
	reason: string | null;
	draftId: string | null;
	sourceMessageId: string;
}
export interface AgentProvider {
	kind: string;
	model: string;
}
export interface AgentSettingsResponse {
	settings: AgentSettings;
	models: string[];
	canManage: boolean;
	canConfigureProvider: boolean;
	providerConfigured: boolean;
	provider: AgentProvider | null;
	autoReplyEnabled: boolean;
	reviewers: { id: string; name: string; email: string }[];
}
export interface AgentConversationsResponse {
	conversations: AgentConversation[];
}
export interface AgentJobsResponse {
	jobs: AgentJob[];
}
export interface AgentHistoryResponse {
	messages: AgentMessage[];
}
export interface AgentErrorResponse {
	error?: string;
}
