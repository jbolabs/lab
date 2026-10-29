"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn as clsx } from "@/lib/utils";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ChevronRight, FilePlus2, Folder, FolderPlus, HardDrive, Paperclip, Plus, Trash2, UploadCloud, UsersRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/sidebar-state";
import { authFetch } from "@/lib/auth/client";
import { formatDriveSize } from "@/lib/drive/utils";
import { DRIVE_FOLDERS_EVENT, DRIVE_LOCATION_EVENT, DRIVE_NEW_FOLDER_EVENT, DRIVE_REFRESH_EVENT, DRIVE_STORAGE_EVENT, DRIVE_UPLOAD_EVENT } from "./drive-events";
import type { DriveLocationDetail, DriveStorageDetail } from "./drive-events";
import { canDropDrive, driveDropHandlers } from "./drive-drag";
import type { DriveDropTarget } from "./drive-drag";

const itemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground/80 outline-none data-[highlighted]:bg-accent";
const FOLDERS_OPEN_KEY = "mailflare-drive-folders-open";

type FolderNode = { id: string; name: string; parentId: string | null };

function flattenFolders(folders: FolderNode[]): (FolderNode & { depth: number })[] {
	const known = new Set(folders.map((folder) => folder.id));
	const children = new Map<string | null, FolderNode[]>();
	for (const folder of folders) {
		const key = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
		children.set(key, [...(children.get(key) ?? []), folder]);
	}
	const rows: (FolderNode & { depth: number })[] = [];
	const visit = (parent: string | null, depth: number) => {
		for (const folder of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))) {
			rows.push({ ...folder, depth });
			visit(folder.id, depth + 1);
		}
	};
	visit(null, 0);
	return rows;
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
	const newDocumentParent = pathname === "/drive" && view !== "trash" ? activeFolder : null;
	const canCreateDocument = !newDocumentParent || (location?.folderId === newDocumentParent && location.canWrite);
	const [creating, setCreating] = useState(false);
	const [folderName, setFolderName] = useState("");
	const [saving, setSaving] = useState(false);
	// The sidebar entry items are being dragged over: "my", "trash" or a folder id.
	const [dropKey, setDropKey] = useState<string | null>(null);

	useEffect(() => {
		const onLocation = (event: Event) => setLocation((event as CustomEvent<DriveLocationDetail>).detail);
		window.addEventListener(DRIVE_LOCATION_EVENT, onLocation);
		const onStorage = (event: Event) => setStorage((event as CustomEvent<DriveStorageDetail>).detail);
		window.addEventListener(DRIVE_STORAGE_EVENT, onStorage);
		return () => { window.removeEventListener(DRIVE_STORAGE_EVENT, onStorage); window.removeEventListener(DRIVE_LOCATION_EVENT, onLocation); };
	}, []);

	useEffect(() => {
		try { setFoldersOpen(localStorage.getItem(FOLDERS_OPEN_KEY) === "1"); } catch { /* storage unavailable */ }
	}, []);

	const loadFolders = useCallback(async () => {
		try {
			const response = await authFetch("/api/drive/folders", { redirectOnUnauthorized: false });
			if (response.ok) setFolders((await response.json() as { folders: FolderNode[] }).folders);
		} catch { /* the list stays as it was */ }
	}, []);

	useEffect(() => {
		if (!foldersOpen) return;
		void loadFolders();
		window.addEventListener(DRIVE_FOLDERS_EVENT, loadFolders);
		return () => window.removeEventListener(DRIVE_FOLDERS_EVENT, loadFolders);
	}, [foldersOpen, loadFolders]);

	function toggleFolders() {
		setFoldersOpen((open) => {
			try { localStorage.setItem(FOLDERS_OPEN_KEY, open ? "0" : "1"); } catch { /* ignore */ }
			return !open;
		});
	}

	async function createFolder(event: React.FormEvent) {
		event.preventDefault();
		const name = folderName.trim();
		if (!name || saving) return;
		setSaving(true);
		try {
			const response = await authFetch("/api/drive/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
			const data = await response.json().catch(() => ({})) as { error?: string };
			if (!response.ok) throw new Error(data.error);
			toast.success(t("drive.folderCreated"));
			setCreating(false);
			setFolderName("");
			if (!foldersOpen) toggleFolders();
			void loadFolders();
			window.dispatchEvent(new Event(DRIVE_REFRESH_EVENT));
		} catch (error) {
			toast.error(error instanceof Error && error.message ? error.message : t("drive.actionFailed"));
		} finally { setSaving(false); }
	}

	const rows = useMemo(() => flattenFolders(folders), [folders]);
	const parents = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.parentId])), [folders]);
	// True when `folderId` is one of `ancestorIds` or sits somewhere beneath one of them.
	const isInside = useCallback((folderId: string, ancestorIds: Set<string>) => {
		for (let current: string | null | undefined = folderId, steps = 0; current && steps < 1000; current = parents.get(current), steps += 1) {
			if (ancestorIds.has(current)) return true;
		}
		return false;
	}, [parents]);
	const dropProps = (key: string, target: DriveDropTarget) => driveDropHandlers(target, () => canDropDrive(target, isInside), t, (over) => setDropKey((current) => (over ? key : current === key ? null : current)));
	const dropHighlight = "bg-signal-soft text-signal-soft-foreground ring-2 ring-inset ring-ring";
	const links = [
		{ key: "my", href: "/drive", label: t("drive.myDrive"), icon: HardDrive },
		{ key: "attachments", href: "/drive?view=attachments", label: t("drive.attachments"), icon: Paperclip },
		{ key: "shared", href: "/drive?view=shared", label: t("drive.sharedWithMe"), icon: UsersRound },
		{ key: "trash", href: "/drive?view=trash", label: t("drive.trash"), icon: Trash2 },
	];
	const percent = storage?.limit ? Math.min(100, Math.round((storage.used / storage.limit) * 100)) : 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1">
				<DropdownMenu.DropdownMenu>
					<DropdownMenu.DropdownMenuTrigger asChild>
						<Button type="button" aria-label={t("drive.new")} className={clsx("mb-3 h-10 max-md:min-h-11", compact ? "size-10 px-0" : "w-full justify-start gap-3 px-3")}>
							<Plus data-icon="inline-start" />{!compact && t("drive.new")}
						</Button>
					</DropdownMenu.DropdownMenuTrigger>
					<DropdownMenu.DropdownMenuPortal>
						<DropdownMenu.DropdownMenuContent align="start" sideOffset={6}><DropdownMenu.DropdownMenuGroup>
							<DropdownMenu.DropdownMenuItem className={itemClass} onSelect={() => { window.dispatchEvent(new Event(DRIVE_NEW_FOLDER_EVENT)); onNavigate?.(); }}><FolderPlus size={18} />{t("drive.newFolder")}</DropdownMenu.DropdownMenuItem>
							{canCreateDocument ? <DropdownMenu.DropdownMenuItem asChild className={itemClass}><Link href={`/drive/document${newDocumentParent ? `?parent=${encodeURIComponent(newDocumentParent)}` : ""}`} onClick={() => onNavigate?.()}><FilePlus2 size={18} />{t("docs.create")}</Link></DropdownMenu.DropdownMenuItem> : <DropdownMenu.DropdownMenuItem disabled className={`${itemClass} opacity-50`}><FilePlus2 size={18} />{t("docs.create")}</DropdownMenu.DropdownMenuItem>}
							<DropdownMenu.DropdownMenuSeparator />
							<DropdownMenu.DropdownMenuItem className={itemClass} onSelect={() => { window.dispatchEvent(new Event(DRIVE_UPLOAD_EVENT)); onNavigate?.(); }}><UploadCloud size={18} />{t("drive.fileUpload")}</DropdownMenu.DropdownMenuItem>
						</DropdownMenu.DropdownMenuGroup></DropdownMenu.DropdownMenuContent>
					</DropdownMenu.DropdownMenuPortal>
				</DropdownMenu.DropdownMenu>
				<nav aria-label={t("drive.sections")} className="flex flex-col gap-0.5">
					{links.map(({ key, href, label, icon: Icon }) => {
						const active = pathname === "/drive" && view === key && !activeFolder;
						// My Drive takes items to its root (restoring them from the trash), Trash trashes them, and
						// Attachments takes trashed attachments back.
						const target: DriveDropTarget | null = key === "my" ? { kind: "folder", id: null } : key === "trash" ? { kind: "trash" } : key === "attachments" ? { kind: "attachments" } : null;
						return (
							<Link key={key} href={href} onClick={onNavigate} {...(target ? dropProps(key, target) : {})} aria-current={active ? "page" : undefined} title={compact ? label : undefined} className={clsx("flex h-9 items-center gap-3 rounded-md text-sm text-sidebar-foreground transition-colors max-md:min-h-11", compact ? "mx-auto size-10 justify-center" : "px-3", dropKey === key ? dropHighlight : active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-sidebar-accent")}>
								<Icon size={16} />{!compact && label}
							</Link>
						);
					})}
				</nav>
				{!compact && (
					<div className="mt-3">
						<div className="flex items-center gap-1">
							<Button variant="ghost" type="button" onClick={toggleFolders} aria-expanded={foldersOpen} aria-label={t("drive.foldersToggle")} className="h-9 min-w-0 flex-1 justify-start gap-2 px-3 font-medium text-sidebar-foreground [@media(pointer:coarse)]:min-h-11">
								<ChevronRight data-icon="inline-start" className={clsx("transition-transform", foldersOpen && "rotate-90")} />{t("drive.folders")}
							</Button>
							<Button variant="ghost" type="button" onClick={() => { setFolderName(""); setCreating(true); }} aria-label={t("drive.newFolder")} title={t("drive.newFolder")} className= "flex size-8 shrink-0 items-center justify-center [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"><Plus data-icon="inline-start" /></Button>
						</div>
						{foldersOpen && (
							<ul className="mt-0.5 flex flex-col gap-0.5">
								{rows.length === 0 && <li className="px-3 py-1.5 text-xs text-muted-foreground">{t("drive.noFolders")}</li>}
								{rows.map((folder) => (
									<li key={folder.id}>
										<Link href={`/drive?folder=${encodeURIComponent(folder.id)}`} onClick={onNavigate} {...dropProps(folder.id, { kind: "folder", id: folder.id })} aria-current={activeFolder === folder.id ? "page" : undefined} style={{ paddingLeft: 12 + folder.depth * 14 }} className={clsx("flex h-8 items-center gap-2 rounded-md pr-3 text-sm text-sidebar-foreground max-md:min-h-11", dropKey === folder.id ? dropHighlight : activeFolder === folder.id ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-sidebar-accent")}>
											<Folder size={14} className="shrink-0 text-muted-foreground" /><span className="truncate">{folder.name}</span>
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
					{storage && (
						storage.limit ? (
							<div className="mb-2">
								<div role="progressbar" aria-label={t("drive.storageBar")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-accent">
									<div className={clsx("h-full rounded-full transition-[width]", percent >= 90 ? "bg-destructive/100" : "bg-primary")} style={{ width: `${percent}%` }} />
								</div>
								<p className="text-xs text-muted-foreground">{t("drive.storageOf", { used: formatDriveSize(storage.used), total: formatDriveSize(storage.limit) })}</p>
							</div>
						) : <p className="mb-2 text-xs text-muted-foreground">{t("drive.storageUsed", { size: formatDriveSize(storage.used) })}</p>
					)}
				</div>
			)}
			<Dialog open={creating} onOpenChange={(open) => { if (!saving) setCreating(open); }}>
				<DialogContent>
					<DialogHeader><DialogTitle>{t("drive.newFolder")}</DialogTitle></DialogHeader>
					<form onSubmit={(event) => void createFolder(event)} className="flex flex-col gap-5">
						<Input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder={t("drive.folderName")} aria-label={t("drive.folderName")} maxLength={255} />
						<div className="flex justify-end gap-2">
							<Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={saving}>{t("common.cancel")}</Button>
							<Button type="submit" disabled={saving || !folderName.trim()}>{t("drive.create")}</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
