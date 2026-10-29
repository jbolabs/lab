"use client";

import { ChevronLeft, Wrench } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

import { AgentEmailLink } from "./email-link";
import type {
	AgentDraftAction,
	AgentEmailReference,
	AgentMessage,
	AgentTurnProps,
} from "./types";
import {
	agentActionProposal,
	agentToolLabel,
	draftFromToolContent,
	parseAgentToolContent,
	parseAgentEmailReference,
} from "./utils";

function emailReferences(
	value: Record<string, unknown>
): AgentEmailReference[] {
	if (Array.isArray(value.emails)) {
		return value.emails
			.map(parseAgentEmailReference)
			.filter((email): email is AgentEmailReference => email !== null);
	}
	if (typeof value.subject === "string") {
		const email = parseAgentEmailReference(value);
		return email ? [email] : [];
	}
	return [];
}

export function AgentToolActivity({
	item,
	forceOpen,
}: {
	item: AgentMessage;
	forceOpen: boolean;
}) {
	const { t } = useLanguage();
	const [open, setOpen] = useState(forceOpen);
	const [prevForceOpen, setPrevForceOpen] = useState(forceOpen);
	if (forceOpen !== prevForceOpen) {
		setPrevForceOpen(forceOpen);
		setOpen(forceOpen);
	}
	const display = agentToolLabel(
		item.toolName,
		item.toolState,
		item.content,
		t
	);
	const result = parseAgentToolContent(item.content);
	const emails = result ? emailReferences(result) : [];
	return (
		<details
			className="group/tool text-xs text-muted-foreground"
			open={forceOpen || open}
			onToggle={(event) => {
				if (!forceOpen) {
					setOpen(event.currentTarget.open);
				}
			}}
		>
			<summary className="flex w-full max-w-full cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
				<Wrench
					size={13}
					className="shrink-0 text-muted-foreground/70"
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1 truncate">{display.label}</span>
				<ChevronLeft
					size={13}
					className="shrink-0 text-muted-foreground/70 transition-transform group-open/tool:-rotate-90"
					aria-hidden="true"
				/>
			</summary>
			<div className="mt-1.5 flex flex-col gap-2 pl-4.5 text-muted-foreground">
				<p>{display.description}</p>
				{emails.length > 0 && (
					<ul className="flex flex-col gap-1.5">
						{emails.map((email) => (
							<li key={email.id} className="break-words">
								<AgentEmailLink
									email={email}
									className="font-medium text-signal hover:underline"
								/>
								{email.from && (
									<span className="text-muted-foreground"> · {email.from}</span>
								)}
								{email.snippet && (
									<p className="line-clamp-2 text-muted-foreground">
										{email.snippet}
									</p>
								)}
							</li>
						))}
					</ul>
				)}
				{result &&
					Object.entries(result)
						.filter(
							([key, value]) =>
								![
									"emails",
									"text",
									"attachments",
									"result",
									"id",
									"subject",
									"from",
									"snippet",
									"url",
									"reviewUrl",
									"action",
									"status",
								].includes(key) &&
								value !== null &&
								typeof value !== "object"
						)
						.map(([key, value]) => (
							<p key={key} className="break-words">
								<span className="text-muted-foreground">
									{key.replaceAll(/(?<capital>[A-Z])/gu, " $<capital>")}:{" "}
								</span>
								{String(value)}
							</p>
						))}
				{typeof result?.text === "string" && (
					<p className="max-h-36 overflow-y-auto break-words whitespace-pre-wrap">
						{result.text}
					</p>
				)}
				{Array.isArray(result?.attachments) &&
					result.attachments.length > 0 && (
						<p>
							{t("agent.activity.attachments", {
								list: result.attachments
									.map(
										(file: { filename?: string }) =>
											file.filename || t("agent.activity.attachment")
									)
									.join(", "),
							})}
						</p>
					)}
				{!result && item.content && (
					<p className="break-words whitespace-pre-wrap">{item.content}</p>
				)}
			</div>
		</details>
	);
}

export function AgentDraftActions({
	action,
	onOpenDraft,
	onApproveDraft,
	approvingId,
}: { action: AgentDraftAction } & Pick<
	AgentTurnProps,
	"onOpenDraft" | "onApproveDraft" | "approvingId"
>) {
	const { t } = useLanguage();
	return (
		<div className="flex flex-wrap items-center justify-end gap-3 text-xs">
			<Button
				variant="outline"
				size="sm"
				type="button"
				onClick={() => onOpenDraft(action.draftId)}
			>
				{t("agent.activity.editDraft")}
			</Button>
			<Button
				size="sm"
				type="button"
				disabled={approvingId === action.draftId}
				onClick={() => onApproveDraft(action.draftId, action.revision)}
			>
				{action.scheduledAt
					? t("agent.activity.schedule")
					: t("agent.activity.approveSend")}
			</Button>
		</div>
	);
}

export function AgentPendingActions({
	item,
	onApproveAction,
	approvingId,
}: Pick<AgentTurnProps, "onApproveAction" | "approvingId"> & {
	item: AgentMessage;
}) {
	const { t } = useLanguage();
	const proposal = agentActionProposal(item.content);
	if (
		proposal?.status !== "pending_approval" ||
		draftFromToolContent(item.content)
	) {
		return null;
	}
	function approvalLabel(
		actionProposal: NonNullable<ReturnType<typeof agentActionProposal>>
	) {
		if (approvingId === item.id) {
			return t("agent.activity.approving");
		}
		if (actionProposal.action === "discard_draft") {
			return t("agent.activity.approveDiscard");
		}
		if (actionProposal.action === "mark_email_read") {
			return t("agent.activity.approveStatus");
		}
		return t("agent.activity.approveMove", {
			destination: actionProposal.destination,
		});
	}

	return (
		<div className="flex flex-col gap-2 text-xs">
			{proposal.emails && (
				<ul className="flex flex-col gap-1">
					{proposal.emails.map((email) => (
						<li key={email.id}>
							<AgentEmailLink
								email={email}
								className="text-signal hover:underline"
							/>
						</li>
					))}
				</ul>
			)}
			<div className="flex flex-wrap items-center justify-end gap-3">
				<Button
					size="sm"
					type="button"
					disabled={!item.recordId || approvingId === item.id}
					onClick={() => onApproveAction(item)}
				>
					{approvalLabel(proposal)}
				</Button>
			</div>
		</div>
	);
}
