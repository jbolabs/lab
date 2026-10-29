"use client";

import { CornerDownRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { QueuedAgentMessagesProps } from "./types";

export function QueuedAgentMessages({
	messages,
	running,
	onRemove,
	onEdit,
	onSteer,
}: QueuedAgentMessagesProps) {
	const { t } = useLanguage();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editText, setEditText] = useState("");
	if (!messages.length) {
		return null;
	}
	return (
		<div
			className="mx-auto w-full max-w-3xl px-3"
			aria-label={t("agent.queue.label")}
		>
			<div className="max-h-48 overflow-y-auto rounded-t-lg border border-b-0 border-signal/30 bg-signal-soft/70 px-2 py-1 shadow-sm">
				{messages.map((item) => (
					<div
						key={item.id}
						className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-background/70"
					>
						<CornerDownRight
							size={15}
							className="shrink-0 text-muted-foreground/70"
							aria-hidden="true"
						/>
						{editingId === item.id ? (
							<form
								className="flex min-w-0 flex-1 items-center gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									if (!editText.trim()) {
										return;
									}
									onEdit(item.id, editText);
									setEditingId(null);
								}}
							>
								<Textarea
									autoFocus
									rows={2}
									className="min-w-0 flex-1 resize-y"
									value={editText}
									onChange={(event) => setEditText(event.target.value)}
									aria-label={t("agent.queue.edit")}
								/>
								<Button
									variant="outline"
									size="sm"
									type="submit"

									className="shrink-0"
									disabled={!editText.trim()}
								>
									{t("settings.autoReply.save")}
								</Button>
								<Button
									variant="outline"
									size="sm"
									type="button"
									className="shrink-0 text-muted-foreground"
									onClick={() => setEditingId(null)}
								>
									{t("common.cancel")}
								</Button>
							</form>
						) : (
							<>
								<span className="min-w-0 flex-1 truncate" title={item.text}>
									{item.text}
								</span>
								<Button
									variant="ghost"
									size="sm"
									type="button"

									className="shrink-0 text-muted-foreground"
									onClick={() => onSteer(item.id)}
									title={
										running
											? t("agent.queue.steerTitle")
											: t("agent.queue.sendNowTitle")
									}
								>
									{running ? t("agent.queue.steer") : t("agent.queue.sendNow")}
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									type="button"

									className="shrink-0 text-muted-foreground"
									aria-label={t("agent.queue.edit")}
									title={t("agent.queue.edit")}
									onClick={() => {
										setEditingId(item.id);
										setEditText(item.text);
									}}
								>
									<Pencil data-icon="inline-start" />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									type="button"
									className="shrink-0 text-muted-foreground hover:text-destructive"
									aria-label={t("agent.queue.remove")}
									title={t("agent.queue.remove")}
									onClick={() => onRemove(item.id)}
								>
									<Trash2 data-icon="inline-start" />
								</Button>
							</>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
