"use client";

import { CheckSquare2 } from "lucide-react";
import { useState } from "react";

import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import { useLanguage } from "@/components/language-provider";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty";
import { withCleanup } from "@/lib/async-cleanup";
import {
	getPermanentDeleteConfirmText,
	PartialDeleteError,
} from "@/lib/messages/permanent-delete-utils";

import { BulkMessageToolbar } from "./bulk-message-toolbar";
import type { BulkMessageSelectionPaneProps } from "./types";
import { useMessageConfirmation } from "./use-message-confirmation";
import { runBulkMessageAction } from "./utils";

export function BulkMessageSelectionPane({
	folder,
	selectedMessages,
	onClearSelection,
}: BulkMessageSelectionPaneProps) {
	const { t } = useLanguage();
	const { confirm, confirmation } = useMessageConfirmation();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const hasUnreadSelection = selectedMessages.some((message) => !message.read);

	async function runAction(action: BulkMessageAction, folderId?: string) {
		if (selectedMessages.length === 0) {
			return;
		}
		if (
			action === "delete" &&
			!(await confirm(
				getPermanentDeleteConfirmText(selectedMessages.length, t)
			))
		) {
			return;
		}

		setPending(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					await runBulkMessageAction(
						selectedMessages.map((message) => message.id),
						action,
						true,
						folderId
					);
					onClearSelection();
				} catch (actionError) {
					setError(
						actionError instanceof PartialDeleteError
							? t("actions.error.deleteSkipped")
							: t("actions.error.update")
					);
				}
			},
			() => {
				setPending(false);
			}
		);
	}

	return (
		<div className="flex h-full items-center justify-center p-8">
			{confirmation}
			<Empty className="max-w-xl">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<CheckSquare2 />
					</EmptyMedia>
					<EmptyTitle>
						{t("common.selectedCount", { count: selectedMessages.length })}
					</EmptyTitle>
					<EmptyDescription>{t("common.chooseBulkAction")}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent className="w-full max-w-none">
					<div className="w-full rounded-lg border bg-card p-3">
						<BulkMessageToolbar
							selectedCount={selectedMessages.length}
							hasUnreadSelection={hasUnreadSelection}
							onAction={runAction}
							onClearSelection={onClearSelection}
							pending={pending}
							folder={folder}
							hideSelectedCount
						/>
					</div>
					{error && (
						<p
							role="alert"
							className="mt-3 text-sm font-medium text-destructive"
						>
							{error}
						</p>
					)}
				</EmptyContent>
			</Empty>
		</div>
	);
}
