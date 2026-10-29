"use client";
import {
	Folder,
	FolderInput,
	FolderPlus,
	HardDrive,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useConfirmation } from "@/app/(calendar)/use-confirmation";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	requireActionEntity,
	requireSuccessfulResponse,
} from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import type { DriveItemDto } from "@/lib/drive/types";

import { driveIconFor } from "./drive-utils";

const FOLDER_ICON_CLASS = driveIconFor({
	contentType: "",
	kind: "folder",
	name: "",
}).className;

interface FolderNode {
	id: string;
	name: string;
	parentId: string | null;
}
type FolderRow = FolderNode & { depth: number; disabled: boolean };

export async function bulk(
	body: Record<string, unknown>,
	fallback: string
): Promise<number | null> {
	try {
		const response = await authFetch("/api/drive/items/bulk", {
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const data = (await response.json().catch(() => ({}))) as {
			count?: number;
			error?: string;
		};
		requireSuccessfulResponse(response, data.error);
		return data.count ?? 0;
	} catch (error) {
		toast.error(
			error instanceof Error && error.message ? error.message : fallback
		);
		return null;
	}
}

export async function attachmentAction(
	action: "trash" | "restore" | "delete",
	ids: string[],
	fallback: string
): Promise<number | null> {
	try {
		const response = await authFetch("/api/drive/attachments", {
			body: JSON.stringify({ action, ids }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const data = (await response.json().catch(() => ({}))) as {
			count?: number;
			error?: string;
		};
		requireSuccessfulResponse(response, data.error);
		return data.count ?? 0;
	} catch (error) {
		toast.error(
			error instanceof Error && error.message ? error.message : fallback
		);
		return null;
	}
}

/** Flattens the folder list depth-first. Folders being moved, and everything beneath them, cannot be targets. */
function buildRows(folders: FolderNode[], moving: Set<string>): FolderRow[] {
	const children = new Map<string | null, FolderNode[]>();
	const known = new Set(folders.map((folder) => folder.id));
	for (const folder of folders) {
		const key =
			folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
		children.set(key, [...(children.get(key) ?? []), folder]);
	}
	const rows: FolderRow[] = [];
	const visit = (parent: string | null, depth: number, blocked: boolean) => {
		for (const folder of (children.get(parent) ?? []).toSorted((a, b) =>
			a.name.localeCompare(b.name, undefined, {
				numeric: true,
				sensitivity: "base",
			})
		)) {
			const disabled = blocked || moving.has(folder.id);
			rows.push({ ...folder, depth, disabled });
			visit(folder.id, depth + 1, disabled);
		}
	};
	visit(null, 0, false);
	return rows;
}

export function DriveBulkActions({
	selected,
	trashView,
	onDone,
}: {
	selected: DriveItemDto[];
	trashView: boolean;
	onDone: () => void;
}) {
	const { t } = useLanguage();
	const { confirm, confirmation } = useConfirmation();
	const [folders, setFolders] = useState<FolderNode[] | null>(null);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const ids = useMemo(() => selected.map((item) => item.id), [selected]);
	const rows = useMemo(
		() => buildRows(folders ?? [], new Set(ids)),
		[folders, ids]
	);
	const driveIds = useMemo(
		() => selected.filter((item) => !item.source).map((item) => item.id),
		[selected]
	);
	const attachmentIds = useMemo(
		() => selected.filter((item) => item.source).map((item) => item.id),
		[selected]
	);
	// Editors can trash what is shared with them; moving, restoring and deleting forever are for the owner.
	const driveItems = selected.filter((item) => !item.source);
	const ownsAll = driveItems.every((item) => item.role === "owner");
	const canTrash = driveItems.every(
		(item) => item.role === "owner" || item.role === "edit"
	);
	const count = selected.length;

	async function run(
		task: () => Promise<number | null>,
		message: (count: number) => string
	) {
		setBusy(true);
		const done = await task();
		setBusy(false);
		if (done === null) {
			return;
		}
		toast.success(message(done));
		onDone();
	}

	/** Applies a trash action to the Drive items and the email attachments in the selection. */
	async function act(
		action: "trash" | "restore" | "delete"
	): Promise<number | null> {
		let total = 0;
		if (driveIds.length) {
			const done = await bulk(
				{ action, ids: driveIds },
				t("drive.actionFailed")
			);
			if (done === null) {
				return null;
			}
			total += done;
		}
		if (attachmentIds.length) {
			const done = await attachmentAction(
				action,
				attachmentIds,
				t("drive.actionFailed")
			);
			if (done === null) {
				return null;
			}
			total += done;
		}
		return total;
	}

	async function loadFolders(open: boolean) {
		if (!open) {
			return;
		}
		setName("");
		try {
			const response = await authFetch("/api/drive/folders");
			requireSuccessfulResponse(response, "Request failed");
			setFolders(
				((await response.json()) as { folders: FolderNode[] }).folders
			);
		} catch {
			toast.error(t("drive.loadFailed"));
		}
	}

	const move = (parentId: string | null) =>
		run(
			() => bulk({ action: "move", ids, parentId }, t("drive.actionFailed")),
			(done) => t("drive.bulkMoved", { count: done })
		);

	async function createAndMove(event: React.FormEvent) {
		event.preventDefault();
		const folderName = name.trim();
		if (!folderName) {
			return;
		}
		setBusy(true);
		try {
			const response = await authFetch("/api/drive/items", {
				body: JSON.stringify({ name: folderName }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json().catch(() => ({}))) as {
				item?: { id: string };
				error?: string;
			};
			requireSuccessfulResponse(response, data.error);
			const item = requireActionEntity(data.item, data.error);
			setBusy(false);
			await move(item.id);
		} catch (error) {
			setBusy(false);
			toast.error(
				error instanceof Error && error.message
					? error.message
					: t("drive.actionFailed")
			);
		}
	}

	return (
		<div className="flex flex-wrap items-center justify-end gap-1 text-sm">
			{confirmation}
			{!trashView && canTrash && (
				<>
					<Button
						type="button"
						variant="ghost"
						disabled={busy}
						onClick={() =>
							run(
								() => act("trash"),
								(done) => t("drive.bulkTrashed", { count: done })
							)
						}
					>
						<Trash2 data-icon="inline-start" />
						{t("drive.moveToTrash")}
					</Button>
					{attachmentIds.length === 0 && ownsAll && (
						<DropdownMenu.DropdownMenu
							onOpenChange={(open) => loadFolders(open)}
						>
							<DropdownMenu.DropdownMenuTrigger asChild>
								<Button type="button" variant="ghost" disabled={busy}>
									<FolderInput data-icon="inline-start" />
									{t("drive.moveToFolder")}
								</Button>
							</DropdownMenu.DropdownMenuTrigger>
							<DropdownMenu.DropdownMenuPortal>
								<DropdownMenu.DropdownMenuContent
									align="end"
									sideOffset={6}
									onCloseAutoFocus={(event) => event.preventDefault()}
									className="w-72"
								>
									<DropdownMenu.DropdownMenuGroup>
										<form
											onSubmit={(event) => createAndMove(event)}

											className="flex items-center gap-1 p-1.5 pb-2"
										>
											<FolderPlus
												size={16}
												className="shrink-0 text-muted-foreground"
											/>
											<Input
												onKeyDown={(event) => event.stopPropagation()}
												ref={inputRef}
												value={name}
												onChange={(event) => setName(event.target.value)}
												maxLength={255}
												placeholder={t("drive.newFolderPlaceholder")}
												aria-label={t("drive.newFolderPlaceholder")}
												className="min-w-0 flex-1"
											/>
											<Button
												type="submit"
												size="sm"
												disabled={busy || !name.trim()}
												title={t("drive.createAndMove")}
											>
												{t("drive.create")}
											</Button>
										</form>
										<DropdownMenu.DropdownMenuSeparator />
										<div className="max-h-64 overflow-y-auto">
											<DropdownMenu.DropdownMenuItem
												onSelect={() => move(null)}
											>
												<HardDrive />
												{t("drive.myDrive")}
											</DropdownMenu.DropdownMenuItem>
											{rows.map((folder) => (
												<DropdownMenu.DropdownMenuItem
													key={folder.id}
													disabled={folder.disabled}
													onSelect={() => move(folder.id)}
													style={
														{
															"--folder-indent": `${8 + folder.depth * 14}px`,
														} as React.CSSProperties
													}
												>
													<Folder className={FOLDER_ICON_CLASS} />
													<span className="truncate pl-(--folder-indent)">
														{folder.name}
													</span>
												</DropdownMenu.DropdownMenuItem>
											))}
											{folders && rows.length === 0 && (
												<p className="px-2 py-1.5 text-xs text-muted-foreground">
													{t("drive.noFolders")}
												</p>
											)}
										</div>
									</DropdownMenu.DropdownMenuGroup>
								</DropdownMenu.DropdownMenuContent>
							</DropdownMenu.DropdownMenuPortal>
						</DropdownMenu.DropdownMenu>
					)}
				</>
			)}
			{ownsAll && trashView && (
				<>
					<Button
						type="button"
						variant="ghost"
						disabled={busy}
						onClick={() =>
							run(
								() => act("restore"),
								(done) => t("drive.bulkRestored", { count: done })
							)
						}
					>
						<RotateCcw data-icon="inline-start" />
						{t("drive.restore")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="text-destructive"
						disabled={busy}
						onClick={async () => {
							if (await confirm(t("drive.confirmBulkDelete", { count }))) {
								void run(
									() => act("delete"),
									(done) => t("drive.bulkDeleted", { count: done })
								);
							}
						}}
					>
						<X data-icon="inline-start" />
						{t("drive.deleteForever")}
					</Button>
				</>
			)}
		</div>
	);
}
