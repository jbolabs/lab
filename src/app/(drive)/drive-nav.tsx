"use client";

import {
	ChevronRight,
	FilePlus2,
	Folder,
	FolderPlus,
	HardDrive,
	Paperclip,
	Plus,
	Trash2,
	UploadCloud,
	UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { layoutLength } from "@/app/layout-values";
import { useLanguage } from "@/components/language-provider";
import { useSidebar } from "@/components/sidebar-state";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { requireSuccessfulResponse, withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { formatDriveSize } from "@/lib/drive/utils";
import { cn as clsx } from "@/lib/utils";

import { canDropDrive, driveDropHandlers } from "./drive-drag";
import type { DriveDropTarget } from "./drive-drag";
import {
	DRIVE_FOLDERS_EVENT,
	DRIVE_LOCATION_EVENT,
	DRIVE_NEW_FOLDER_EVENT,
	DRIVE_REFRESH_EVENT,
	DRIVE_STORAGE_EVENT,
	DRIVE_UPLOAD_EVENT,
} from "./drive-events";
import type { DriveLocationDetail, DriveStorageDetail } from "./drive-events";

const FOLDERS_OPEN_KEY = "mailflare-drive-folders-open";

interface FolderNode {
	id: string;
	name: string;
	parentId: string | null;
}

function flattenFolders(
	folders: FolderNode[]
): (FolderNode & { depth: number })[] {
	const known = new Set(folders.map((folder) => folder.id));
	const children = new Map<string | null, FolderNode[]>();
	for (const folder of folders) {
		const key =
			folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
		children.set(key, [...(children.get(key) ?? []), folder]);
	}
	const rows: (FolderNode & { depth: number })[] = [];
	const visit = (parent: string | null, depth: number) => {
		for (const folder of (children.get(parent) ?? []).toSorted((a, b) =>
			a.name.localeCompare(b.name, undefined, {
				numeric: true,
				sensitivity: "base",
			})
		)) {
			rows.push({ ...folder, depth });
			visit(folder.id, depth + 1);
		}
	};
	visit(null, 0);
	return rows;
}

function subscribeFoldersOpen(onChange: () => void) {
	window.addEventListener("storage", onChange);
	return () => window.removeEventListener("storage", onChange);
}
function readFoldersOpen() {
	try {
		return localStorage.getItem(FOLDERS_OPEN_KEY) === "1";
	} catch {
		return false;
	}
}

export function DriveNav({ onNavigate }: { onNavigate?: () => void }) {
	const { t } = useLanguage();
	const { minimal, mobile } = useSidebar();
	const pathname = usePathname();
	const params = useSearchParams();
	const view = params.get("view") ?? "my";
	const activeFolder = params.get("folder");
	const [location, setLocation] = useState<DriveLocationDetail | null>(null);
	const [storage, setStorage] = useState<DriveStorageDetail | null>(null);
	const [foldersOpen, setFoldersOpen] = useState(false);
	const [folders, setFolders] = useState<FolderNode[]>([]);
	const compact = minimal && !mobile;
	// Wait for this folder’s listing permissions before offering creation there.
	const newDocumentParent =
		pathname === "/drive" && view !== "trash" ? activeFolder : null;
	const canCreateDocument =
		!newDocumentParent ||
		(location?.folderId === newDocumentParent && location.canWrite);
	const [creating, setCreating] = useState(false);
	const [folderName, setFolderName] = useState("");
	const [saving, setSaving] = useState(false);
	// The sidebar entry items are being dragged over: "my", "trash" or a folder id.
	const [dropKey, setDropKey] = useState<string | null>(null);

	useEffect(() => {
		const onLocation = (event: Event) =>
			setLocation((event as CustomEvent<DriveLocationDetail>).detail);
		window.addEventListener(DRIVE_LOCATION_EVENT, onLocation);
		const onStorage = (event: Event) =>
			setStorage((event as CustomEvent<DriveStorageDetail>).detail);
		window.addEventListener(DRIVE_STORAGE_EVENT, onStorage);
		return () => {
			window.removeEventListener(DRIVE_STORAGE_EVENT, onStorage);
			window.removeEventListener(DRIVE_LOCATION_EVENT, onLocation);
		};
	}, []);

	const savedOpen = useSyncExternalStore(
		subscribeFoldersOpen,
		readFoldersOpen,
		() => false
	);
	const [previousSavedOpen, setPreviousSavedOpen] = useState(false);
	if (savedOpen !== previousSavedOpen) {
		setPreviousSavedOpen(savedOpen);
		setFoldersOpen(savedOpen);
	}

	const loadFolders = useCallback(async () => {
		try {
			const response = await authFetch("/api/drive/folders", {
				redirectOnUnauthorized: false,
			});
			if (response.ok) {
				setFolders(
					((await response.json()) as { folders: FolderNode[] }).folders
				);
			}
		} catch {
			/* the list stays as it was */
		}
	}, []);

	useEffect(() => {
		if (!foldersOpen) {
			return;
		}
		void (async () => {
			await loadFolders();
		})();
		window.addEventListener(DRIVE_FOLDERS_EVENT, loadFolders);
		return () => window.removeEventListener(DRIVE_FOLDERS_EVENT, loadFolders);
	}, [foldersOpen, loadFolders]);

	function toggleFolders() {
		setFoldersOpen((open) => {
			try {
				localStorage.setItem(FOLDERS_OPEN_KEY, open ? "0" : "1");
			} catch {
				/* ignore */
			}
			return !open;
		});
	}

	function createFolder(event: React.FormEvent) {
		event.preventDefault();
		const name = folderName.trim();
		if (!name || saving) {
			return;
		}
		setSaving(true);
		return withCleanup(
			async () => {
				try {
					const response = await authFetch("/api/drive/items", {
						body: JSON.stringify({ name }),
						headers: { "Content-Type": "application/json" },
						method: "POST",
					});
					const data = (await response.json().catch(() => ({}))) as {
						error?: string;
					};
					requireSuccessfulResponse(response, data.error);
					toast.success(t("drive.folderCreated"));
					setCreating(false);
					setFolderName("");
					if (!foldersOpen) {
						toggleFolders();
					}
					void (async () => {
						await loadFolders();
					})();
					window.dispatchEvent(new Event(DRIVE_REFRESH_EVENT));
				} catch (error) {
					toast.error(
						error instanceof Error && error.message
							? error.message
							: t("drive.actionFailed")
					);
				}
			},
			() => {
				setSaving(false);
			}
		);
	}

	const rows = useMemo(() => flattenFolders(folders), [folders]);
	const parents = useMemo(
		() => new Map(folders.map((folder) => [folder.id, folder.parentId])),
		[folders]
	);
	// True when `folderId` is one of `ancestorIds` or sits somewhere beneath one of them.
	const isInside = useCallback(
		(folderId: string, ancestorIds: Set<string>) => {
			for (
				let current: string | null | undefined = folderId, steps = 0;
				current && steps < 1000;
				current = parents.get(current), steps += 1
			) {
				if (ancestorIds.has(current)) {
					return true;
				}
			}
			return false;
		},
		[parents]
	);
	const dropProps = (key: string, target: DriveDropTarget) =>
		driveDropHandlers(
			target,
			() => canDropDrive(target, isInside),
			t,
			(over) =>
				setDropKey((current) =>
					(() => {
						if (over) {
							return key;
						}
						if (current === key) {
							return null;
						}
						return current;
					})()
				)
		);
	const dropHighlight =
		"bg-signal-soft text-signal-soft-foreground ring-2 ring-inset ring-ring";
	const links = [
		{ href: "/drive", icon: HardDrive, key: "my", label: t("drive.myDrive") },
		{
			href: "/drive?view=attachments",
			icon: Paperclip,
			key: "attachments",
			label: t("drive.attachments"),
		},
		{
			href: "/drive?view=shared",
			icon: UsersRound,
			key: "shared",
			label: t("drive.sharedWithMe"),
		},
		{
			href: "/drive?view=trash",
			icon: Trash2,
			key: "trash",
			label: t("drive.trash"),
		},
	];
	const percent = storage?.limit
		? Math.min(100, Math.round((storage.used / storage.limit) * 100))
		: 0;

	function renderDriveNavigation() {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1">
					<DropdownMenu.DropdownMenu>
						<DropdownMenu.DropdownMenuTrigger
							render={
								<Button
									type="button"
									aria-label={t("drive.new")}
									size={compact ? "icon-lg" : "lg"}
									className={clsx("mb-3", !compact && "w-full justify-start")}
								/>
							}
						>
							<Plus data-icon="inline-start" />
							{!compact && t("drive.new")}
						</DropdownMenu.DropdownMenuTrigger>
						<DropdownMenu.DropdownMenuPortal>
							<DropdownMenu.DropdownMenuContent align="start" sideOffset={6}>
								<DropdownMenu.DropdownMenuGroup>
									<DropdownMenu.DropdownMenuItem
										onClick={() => {
											window.dispatchEvent(new Event(DRIVE_NEW_FOLDER_EVENT));
											onNavigate?.();
										}}
									>
										<FolderPlus size={18} />
										{t("drive.newFolder")}
									</DropdownMenu.DropdownMenuItem>
									{canCreateDocument ? (
										<DropdownMenu.DropdownMenuItem
											render={
												<Link
													href={`/drive/document${newDocumentParent ? `?parent=${encodeURIComponent(newDocumentParent)}` : ""}`}
													onClick={() => onNavigate?.()}
												/>
											}
										>
											<FilePlus2 size={18} />
											{t("docs.create")}
										</DropdownMenu.DropdownMenuItem>
									) : (
										<DropdownMenu.DropdownMenuItem disabled>
											<FilePlus2 size={18} />
											{t("docs.create")}
										</DropdownMenu.DropdownMenuItem>
									)}
									<DropdownMenu.DropdownMenuSeparator />
									<DropdownMenu.DropdownMenuItem
										onClick={() => {
											window.dispatchEvent(new Event(DRIVE_UPLOAD_EVENT));
											onNavigate?.();
										}}
									>
										<UploadCloud size={18} />
										{t("drive.fileUpload")}
									</DropdownMenu.DropdownMenuItem>
								</DropdownMenu.DropdownMenuGroup>
							</DropdownMenu.DropdownMenuContent>
						</DropdownMenu.DropdownMenuPortal>
					</DropdownMenu.DropdownMenu>
					<nav
						aria-label={t("drive.sections")}
						className="flex flex-col gap-0.5"
					>
						{links.map(({ key, href, label, icon: Icon }) => {
							const active =
								pathname === "/drive" && view === key && !activeFolder;
							const target: DriveDropTarget | null =
								((): DriveDropTarget | null => {
									if (key === "my") {
										return { id: null, kind: "folder" };
									}
									if (key === "trash") {
										return { kind: "trash" };
									}
									if (key === "attachments") {
										return { kind: "attachments" };
									}
									return null;
								})();
							return (
								<Link
									key={key}
									href={href}
									onClick={onNavigate}
									{...(target ? dropProps(key, target) : {})}
									aria-current={active ? "page" : undefined}
									title={compact ? label : undefined}
									className={clsx(
										"flex h-9 items-center gap-3 rounded-md text-sm text-sidebar-foreground transition-colors max-md:min-h-11",
										compact ? "mx-auto size-10 justify-center" : "px-3",
										(() => {
											if (dropKey === key) {
												return dropHighlight;
											}
											if (active) {
												return "bg-sidebar-accent font-medium text-sidebar-accent-foreground";
											}
											return "hover:bg-sidebar-accent";
										})()
									)}
								>
									<Icon size={16} />
									{!compact && label}
								</Link>
							);
						})}
					</nav>
					{!compact && (
						<div className="mt-3">
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									type="button"
									onClick={toggleFolders}
									aria-expanded={foldersOpen}
									aria-label={t("drive.foldersToggle")}
									className="min-w-0 flex-1 justify-start"
								>
									<ChevronRight
										data-icon="inline-start"
										className={clsx(
											"transition-transform",
											foldersOpen && "rotate-90"
										)}
									/>
									{t("drive.folders")}
								</Button>
								<Button
									variant="ghost"
									type="button"
									onClick={() => {
										setFolderName("");
										setCreating(true);
									}}
									aria-label={t("drive.newFolder")}
									title={t("drive.newFolder")}
									size="icon-sm"
									className="shrink-0"
								>
									<Plus data-icon="inline-start" />
								</Button>
							</div>
							{foldersOpen && (
								<ul className="mt-0.5 flex flex-col gap-0.5">
									{rows.length === 0 && (
										<li className="px-3 py-1.5 text-xs text-muted-foreground">
											{t("drive.noFolders")}
										</li>
									)}
									{rows.map((folder) => (
										<li key={folder.id}>
											<Link
												href={`/drive?folder=${encodeURIComponent(folder.id)}`}
												onClick={onNavigate}
												{...dropProps(folder.id, {
													id: folder.id,
													kind: "folder",
												})}
												aria-current={
													activeFolder === folder.id ? "page" : undefined
												}
												style={
													{
														"--layout-indent": layoutLength(
															12 + folder.depth * 14
														),
													} as React.CSSProperties
												}
												className={clsx(
													clsx(
														"flex h-8 items-center gap-2 rounded-md pr-3 text-sm text-sidebar-foreground max-md:min-h-11",
														(() => {
															if (dropKey === folder.id) {
																return dropHighlight;
															}
															if (activeFolder === folder.id) {
																return "bg-sidebar-accent font-medium text-sidebar-accent-foreground";
															}
															return "hover:bg-sidebar-accent";
														})()
													),
													"pl-(--layout-indent)"
												)}
											>
												<Folder
													size={14}
													className="shrink-0 text-muted-foreground"
												/>
												<span className="truncate">{folder.name}</span>
											</Link>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>
				{!compact && (
					<div className="shrink-0 border-t border-border/70 px-4 py-3">
						{storage &&
							(storage.limit ? (
								<div className="mb-2">
									<Progress
										value={percent}
										aria-label={t("drive.storageBar")}
										variant={percent >= 90 ? "destructive" : "default"}
										className="mb-1.5 h-1.5"
									/>
									<p className="text-xs text-muted-foreground">
										{t("drive.storageOf", {
											total: formatDriveSize(storage.limit),
											used: formatDriveSize(storage.used),
										})}
									</p>
								</div>
							) : (
								<p className="mb-2 text-xs text-muted-foreground">
									{t("drive.storageUsed", {
										size: formatDriveSize(storage.used),
									})}
								</p>
							))}
					</div>
				)}
				<Dialog
					open={creating}
					onOpenChange={(open) => {
						if (!saving) {
							setCreating(open);
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t("drive.newFolder")}</DialogTitle>
						</DialogHeader>
						<form
							onSubmit={(event) => createFolder(event)}
							className="flex flex-col gap-5"
						>
							<Input
								autoFocus
								value={folderName}
								onChange={(event) => setFolderName(event.target.value)}
								placeholder={t("drive.folderName")}
								aria-label={t("drive.folderName")}
								maxLength={255}
							/>
							<div className="flex justify-end gap-2">
								<Button
									type="button"
									variant="ghost"
									onClick={() => setCreating(false)}
									disabled={saving}
								>
									{t("common.cancel")}
								</Button>
								<Button type="submit" disabled={saving || !folderName.trim()}>
									{t("drive.create")}
								</Button>
							</div>
						</form>
					</DialogContent>
				</Dialog>
			</div>
		);
	}
	return renderDriveNavigation();
}
