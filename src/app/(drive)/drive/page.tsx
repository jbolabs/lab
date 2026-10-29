"use client";

import {
	ArrowDown,
	ArrowUp,
	ChevronRight,
	Download,
	ExternalLink,
	FolderOpen,
	Mail,
	MoreVertical,
	Pencil,
	RotateCcw,
	Share2,
	Trash2,
	UploadCloud,
	X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useConfirmation } from "@/app/(calendar)/use-confirmation";
import { useHeaderSlot } from "@/app/header-slot";
import { layoutLength } from "@/app/layout-values";
import { HeaderSearch } from "@/components/header-search";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item } from "@/components/ui/item";
import { PageTitle } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { isDriveCategory } from "@/lib/drive/category-names";
import type { DriveCategory } from "@/lib/drive/category-names";
import { isMarkdownFile } from "@/lib/drive/documents-client";
import type { DriveItemDto } from "@/lib/drive/types";
import {
	canEditDrive,
	DRIVE_MAX_FILE_BYTES,
	formatDriveSize,
} from "@/lib/drive/utils";
import { cn as clsx } from "@/lib/utils";

import { DriveBulkActions } from "../drive-bulk-actions";
import {
	clearDriveListings,
	readDriveListing,
	saveDriveListing,
} from "../drive-cache";
import type { DriveListing } from "../drive-cache";
import { ColumnResizeHandle, useDriveColumns } from "../drive-columns";
import {
	canDropDrive,
	driveDropHandlers,
	endDriveDrag,
	isDriveDraggable,
	startDriveDrag,
} from "../drive-drag";
import {
	DRIVE_FOLDERS_EVENT,
	DRIVE_LOCATION_EVENT,
	DRIVE_NEW_FOLDER_EVENT,
	DRIVE_REFRESH_EVENT,
	DRIVE_STORAGE_EVENT,
	DRIVE_UPLOAD_EVENT,
} from "../drive-events";
import { DriveOwnerAvatar } from "../drive-owner-avatar";
import { DrivePreviewBody } from "../drive-preview";
import { DriveShareDialog } from "../drive-share-dialog";
import { DriveTypeFilter } from "../drive-type-filter";
import { uploadDriveFile } from "../drive-upload";
import { DriveUploadPanel } from "../drive-upload-panel";
import type { DriveUploadEntry } from "../drive-upload-types";
import {
	driveFileUrl,
	driveIconFor,
	emailUrl,
	sortDriveItems,
} from "../drive-utils";
import type { DriveSortKey } from "../drive-utils";

const dateFormat = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const json = (method: string, body: unknown): RequestInit => ({
	body: JSON.stringify(body),
	headers: { "Content-Type": "application/json" },
	method,
});

export default function DrivePage() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useConfirmation();
	const router = useRouter();
	const params = useSearchParams();
	const view = params.get("view") ?? "my";
	const folder = params.get("folder");
	const query = params.get("q") ?? "";
	const typesParam = params.get("types") ?? "";
	const types = useMemo(
		() =>
			typesParam
				.split(",")
				.filter((entry): entry is DriveCategory => isDriveCategory(entry)),
		[typesParam]
	);
	const [listing, setListing] = useState<{
		key: string;
		data: DriveListing;
	} | null>(null);
	const [failedKey, setFailedKey] = useState<string | null>(null);
	const [uploads, setUploads] = useState<DriveUploadEntry[]>([]);
	const uploadSeq = useRef(0);
	const [sortKey, setSortKey] = useState<DriveSortKey>("name");
	const columns = useDriveColumns();
	const [ascending, setAscending] = useState(true);
	const [dragging, setDragging] = useState(false);
	const [search, setSearch] = useState(query);
	const headerTarget = useHeaderSlot("#drive-header-slot");
	const [preview, setPreview] = useState<DriveItemDto | null>(null);
	const [sharing, setSharing] = useState<DriveItemDto | null>(null);
	const [naming, setNaming] = useState<
		| ({ value: string } & (
				| { mode: "create" }
				| { mode: "rename"; item: DriveItemDto }
		  ))
		| null
	>(null);
	const [storedSelectedIds, setStoredSelectedIds] = useState<Set<string>>(
		new Set()
	);
	const fileInput = useRef<HTMLInputElement | null>(null);
	const dragDepth = useRef(0);
	// Rows being dragged to another folder or the trash, and the folder row under the pointer.
	const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
	const [dropFolder, setDropFolder] = useState<string | null>(null);

	const requestKey = `${view}|${folder ?? ""}|${query}|${typesParam}`;
	// A listing seen before renders straight from memory while it is refetched; only a new one shows the skeleton.
	const current =
		listing?.key === requestKey ? listing.data : readDriveListing(requestKey);
	const items = useMemo(() => current?.items ?? [], [current]);
	const path = current?.path ?? [];
	const role = current?.role ?? "owner";
	const loading = !current;
	const failed = failedKey === requestKey && !current;
	const canWrite =
		view !== "trash" && (folder ? canEditDrive(role) : view === "my");
	// The key of the listing the page currently wants, so a slow response for a folder we already left is dropped.
	const requestRef = useRef(requestKey);
	useEffect(() => {
		requestRef.current = requestKey;
	}, [requestKey]);

	const load = useCallback(async () => {
		const key = requestKey;
		const queryParams = new URLSearchParams({ view });
		if (folder) {
			queryParams.set("parent", folder);
		}
		if (query) {
			queryParams.set("q", query);
		}
		if (typesParam) {
			queryParams.set("types", typesParam);
		}
		try {
			const response = await authFetch(`/api/drive/items?${queryParams}`);
			requireSuccessfulResponse(response, "Request failed");
			const data = (await response.json()) as DriveListing;
			saveDriveListing(key, data);
			if (key !== requestRef.current) {
				return;
			}
			setListing({ data, key });
			setFailedKey(null);
			window.dispatchEvent(
				new CustomEvent(DRIVE_STORAGE_EVENT, {
					detail: { limit: data.storageLimit, used: data.storageUsed },
				})
			);
			window.dispatchEvent(new Event(DRIVE_FOLDERS_EVENT));
			window.dispatchEvent(
				new CustomEvent(DRIVE_LOCATION_EVENT, {
					detail: {
						canWrite: folder ? canEditDrive(data.role) : view === "my",
						folderId: folder,
					},
				})
			);
		} catch {
			if (key === requestRef.current) {
				setFailedKey(key);
			}
		}
	}, [view, folder, query, typesParam, requestKey]);
	// Reload after a change; other cached listings may be stale now, so they are dropped.
	const refresh = useCallback(() => {
		clearDriveListings();
		return load();
	}, [load]);

	useEffect(() => {
		void (async () => {
			await load();
		})();
	}, [load]);

	useEffect(() => {
		const onRefresh = () => refresh();
		window.addEventListener(DRIVE_REFRESH_EVENT, onRefresh);
		return () => window.removeEventListener(DRIVE_REFRESH_EVENT, onRefresh);
	}, [refresh]);
	const [previousRequestKey, setPreviousRequestKey] = useState(requestKey);
	const [previousQuery, setPreviousQuery] = useState(query);
	if (previousQuery !== query) {
		setPreviousQuery(query);
		setSearch(query);
	}
	if (previousRequestKey !== requestKey) {
		setPreviousRequestKey(requestKey);
		setStoredSelectedIds(new Set());
	}
	const presentIds = new Set(items.map((item) => item.id));
	const selectedIds = new Set(
		[...storedSelectedIds].filter((id) => presentIds.has(id))
	);

	const patchUpload = useCallback(
		(id: string, patch: Partial<DriveUploadEntry>) =>
			setUploads((list) =>
				list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
			),
		[]
	);

	const upload = useCallback(
		async (files: File[]) => {
			if (!canWrite || !files.length) {
				return;
			}
			const accepted: { id: string; file: File }[] = [];
			for (const file of files) {
				if (file.size > DRIVE_MAX_FILE_BYTES) {
					toast.error(
						t("drive.tooLarge", {
							name: file.name,
							size: formatDriveSize(DRIVE_MAX_FILE_BYTES),
						})
					);
				} else {
					accepted.push({ file, id: `upload-${(uploadSeq.current += 1)}` });
				}
			}
			if (!accepted.length) {
				return;
			}
			setUploads((list) => [
				...list,
				...accepted.map(({ id, file }) => ({
					id,
					name: file.name,
					percent: 0,
					resumed: false,
					status: "queued" as const,
				})),
			]);
			let done = 0;
			for (const { id, file } of accepted) {
				patchUpload(id, { status: "uploading" });
				try {
					// oxlint-disable-next-line no-await-in-loop -- Upload files serially to bound multipart memory and preserve progress ordering.
					await uploadDriveFile(file, folder, (percent, resumed) =>
						patchUpload(id, { percent, resumed })
					);
					done += 1;
					patchUpload(id, { percent: 100, status: "done" });
				} catch (error) {
					patchUpload(id, {
						error:
							error instanceof Error && error.message
								? error.message
								: t("drive.uploadFailed", { name: file.name }),
						status: "failed",
					});
				}
			}
			if (done) {
				await refresh();
			}
		},
		[canWrite, folder, refresh, patchUpload, t]
	);

	const canWriteRef = useRef(canWrite);
	useEffect(() => {
		canWriteRef.current = canWrite;
	}, [canWrite]);
	useEffect(() => {
		const onUpload = () => {
			if (canWriteRef.current) {
				fileInput.current?.click();
			}
		};
		const onFolder = () => {
			if (canWriteRef.current) {
				setNaming({ mode: "create", value: t("drive.untitledFolder") });
			}
		};
		window.addEventListener(DRIVE_UPLOAD_EVENT, onUpload);
		window.addEventListener(DRIVE_NEW_FOLDER_EVENT, onFolder);
		return () => {
			window.removeEventListener(DRIVE_UPLOAD_EVENT, onUpload);
			window.removeEventListener(DRIVE_NEW_FOLDER_EVENT, onFolder);
		};
	}, [t]);

	async function mutate(
		url: string,
		init: RequestInit,
		successMessage?: string
	) {
		try {
			const response = await authFetch(url, init);
			if (!response.ok) {
				const data = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				requireSuccessfulResponse(response, data.error);
			}
			if (successMessage) {
				toast.success(successMessage);
			}
			await refresh();
			return true;
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? error.message
					: t("drive.actionFailed")
			);
			return false;
		}
	}

	async function submitName(event: React.FormEvent) {
		event.preventDefault();
		if (!naming || !naming.value.trim()) {
			return;
		}
		const ok =
			naming.mode === "create"
				? await mutate(
						"/api/drive/items",
						json("POST", { name: naming.value, parentId: folder })
					)
				: await mutate(
						`/api/drive/items/${naming.item.id}`,
						json("PATCH", { name: naming.value })
					);
		if (ok) {
			setNaming(null);
		}
	}

	function open(item: DriveItemDto) {
		if (item.trashedAt) {
			return;
		}
		if (item.kind === "folder") {
			router.push(
				`/drive?folder=${encodeURIComponent(item.id)}${view === "shared" ? "&view=shared" : ""}`
			);
		} else if (!item.source && isMarkdownFile(item)) {
			router.push(`/drive/document?id=${encodeURIComponent(item.id)}`);
		} else {
			setPreview(item);
		}
	}

	function onDragEnter(event: DragEvent) {
		if (!canWrite || !event.dataTransfer.types.includes("Files")) {
			return;
		}
		event.preventDefault();
		dragDepth.current += 1;
		setDragging(true);
	}
	function onDragLeave() {
		dragDepth.current = Math.max(0, dragDepth.current - 1);
		if (dragDepth.current === 0) {
			setDragging(false);
		}
	}
	function onDrop(event: DragEvent) {
		if (!canWrite || !event.dataTransfer.types.includes("Files")) {
			return;
		}
		event.preventDefault();
		dragDepth.current = 0;
		setDragging(false);
		void upload([...event.dataTransfer.files]);
	}

	const sorted = useMemo(
		() => sortDriveItems(items, sortKey, ascending),
		[items, sortKey, ascending]
	);

	const selectable = sorted.filter((item) =>
		item.source ? item.source.canDelete : canEditDrive(item.role)
	);
	const selectedItems = selectable.filter((item) => selectedIds.has(item.id));

	// Dragging a selected row carries the whole selection; any other row goes alone.
	function onItemDragStart(event: DragEvent, item: DriveItemDto) {
		const group = selectedIds.has(item.id)
			? selectedItems.filter(isDriveDraggable)
			: [item];
		startDriveDrag(event, group, t("drive.selected", { count: group.length }));
		setMovingIds(new Set(group.map((entry) => entry.id)));
	}
	function onItemDragEnd() {
		endDriveDrag();
		setMovingIds(new Set());
		setDropFolder(null);
	}

	function setTypes(next: DriveCategory[]) {
		const queryParams = new URLSearchParams(params.toString());
		if (next.length) {
			queryParams.set("types", next.join(","));
		} else {
			queryParams.delete("types");
		}
		router.push(`/drive${queryParams.size ? `?${queryParams}` : ""}`);
	}

	// Attachments can only be selected when the user may delete them.
	const allSelected =
		selectable.length > 0 && selectedItems.length === selectable.length;
	const toggleItem = (id: string) =>
		setStoredSelectedIds((previous) => {
			const next = new Set(previous);
			if (!next.delete(id)) {
				next.add(id);
			}
			return next;
		});
	const attachmentsView = view === "attachments" && !folder;
	const title = (() => {
		if (view === "attachments") {
			return t("drive.attachments");
		}
		if (view === "trash") {
			return t("drive.trash");
		}
		if (view === "shared") {
			return t("drive.sharedWithMe");
		}
		if (query) {
			return t("drive.search");
		}
		return t("drive.myDrive");
	})();
	const rootHref = view === "shared" ? "/drive?view=shared" : "/drive";
	const emptyText = (() => {
		if (view === "attachments") {
			return t("drive.emptyAttachments");
		}
		if (view === "trash") {
			return t("drive.emptyTrash");
		}
		if (view === "shared") {
			return t("drive.emptyShared");
		}
		if (query) {
			return t("drive.emptySearch");
		}
		return t("drive.empty");
	})();

	function toggleSort(key: DriveSortKey) {
		if (key === sortKey) {
			setAscending((value) => !value);
		} else {
			setSortKey(key);
			setAscending(true);
		}
	}
	const SortIcon = ascending ? ArrowUp : ArrowDown;
	const headerButton = (key: DriveSortKey, label: string) => (
		<Button
			variant="ghost"
			type="button"
			onClick={() => toggleSort(key)}
			className="min-w-0"
		>
			<span className="truncate">{label}</span>
			{sortKey === key && <SortIcon size={12} className="shrink-0" />}
		</Button>
	);
	const gridStyle = {
		"--drive-columns": columns.template,
	} as React.CSSProperties;

	function renderDriveListing() {
		return (
			<div className="flex min-h-0 flex-1 flex-col rounded-t-lg bg-card">
				<div className="flex min-h-17 shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
						<nav
							aria-label={title}
							className="flex min-w-0 flex-wrap items-center gap-1 text-xl text-foreground max-md:text-lg"
						>
							{(() => {
								if (loading && folder) {
									return <Skeleton className="h-7 w-48" />;
								}
								if (path.length === 0) {
									return <PageTitle size="sm">{title}</PageTitle>;
								}
								return (
									<>
										<Button
											variant="ghost"
											type="button"
											onClick={() => router.push(rootHref)}
											className=""
										>
											{view === "shared" || role !== "owner"
												? t("drive.sharedWithMe")
												: t("drive.myDrive")}
										</Button>
										{path.map((crumb, index) => (
											<span key={crumb.id} className="flex items-center gap-1">
												<ChevronRight
													size={18}
													className="text-muted-foreground"
												/>
												{index === path.length - 1 ? (
													<PageTitle size="sm" className="">
														{crumb.name}
													</PageTitle>
												) : (
													<Button
														variant="ghost"
														type="button"
														onClick={() =>
															router.push(
																`/drive?folder=${encodeURIComponent(crumb.id)}${view === "shared" ? "&view=shared" : ""}`
															)
														}
														className=""
													>
														{crumb.name}
													</Button>
												)}
											</span>
										))}
									</>
								);
							})()}
						</nav>
						{selectedItems.length > 0 && (
							<span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
								<Button
									variant="ghost"
									type="button"
									onClick={() => setStoredSelectedIds(new Set())}
									aria-label={t("navigation.close")}
									size="icon-sm"
								>
									<X data-icon="inline-start" />
								</Button>
								{t("drive.selected", { count: selectedItems.length })}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						{selectedItems.length > 0 && (
							<DriveBulkActions
								selected={selectedItems}
								trashView={view === "trash"}
								onDone={() => {
									setStoredSelectedIds(new Set());
									void refresh();
								}}
							/>
						)}
						<DriveTypeFilter value={types} onChange={setTypes} />
					</div>
				</div>
				{view === "trash" && !folder && (
					<p className="shrink-0 border-b border-border bg-muted/60 px-5 py-2 text-xs text-muted-foreground">
						{t("drive.trashNotice", { days: 30 })}
					</p>
				)}
				<div
					style={gridStyle}
					className={clsx(
						"grid shrink-0 items-center gap-x-4 border-b border-border px-5 py-2 text-sm",
						"grid-cols-[2rem_minmax(0,1fr)_2.5rem]",
						"md:grid-cols-(--drive-columns)"
					)}
				>
					<Checkbox
						checked={(() => {
							if (allSelected) {
								return true;
							}
							if (selectedItems.length > 0) {
								return "indeterminate";
							}
							return false;
						})()}
						onCheckedChange={() =>
							setStoredSelectedIds(
								allSelected
									? new Set()
									: new Set(selectable.map((item) => item.id))
							)
						}
						disabled={selectable.length === 0}
						aria-label={t("drive.selectAll")}
						className="ml-1"
					/>
					<span className="min-w-0 pl-7">
						{headerButton("name", t("drive.name"))}
					</span>
					<span className="relative hidden min-w-0 md:block">
						{headerButton(
							"owner",
							attachmentsView ? t("drive.from") : t("drive.owner")
						)}
						<ColumnResizeHandle
							column="owner"
							width={columns.widths.owner}
							onResize={(...args) => columns.resize(...args)}
							label={t("drive.owner")}
						/>
					</span>
					<span className="relative hidden min-w-0 md:block">
						{headerButton("updatedAt", t("drive.modified"))}
						<ColumnResizeHandle
							column="updatedAt"
							width={columns.widths.updatedAt}
							onResize={(...args) => columns.resize(...args)}
							label={t("drive.modified")}
						/>
					</span>
					<span className="relative hidden min-w-0 md:block">
						{headerButton("size", t("drive.fileSize"))}
						<ColumnResizeHandle
							column="size"
							width={columns.widths.size}
							onResize={(...args) => columns.resize(...args)}
							label={t("drive.fileSize")}
						/>
					</span>
					<span />
				</div>
				<div
					role={!failed && !loading && sorted.length > 0 ? "list" : undefined}
					aria-label={
						!failed && !loading && sorted.length > 0
							? t("drive.title")
							: undefined
					}
					className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain px-2 pt-px"
				>
					{(() => {
						if (failed) {
							return (
								<p className="p-8 text-center text-sm text-muted-foreground">
									{t("drive.loadFailed")}
								</p>
							);
						}
						if (loading) {
							return Array.from({ length: 8 }, (_, index) => (
								<div
									key={index}
									aria-hidden="true"
									style={gridStyle}
									className={clsx(
										"grid items-center gap-x-4 px-3 py-3.5",
										"grid-cols-[2rem_minmax(0,1fr)_2.5rem]",
										"md:grid-cols-(--drive-columns)"
									)}
								>
									<Skeleton className="ml-1 size-4" />
									<span className="flex items-center gap-3">
										<Skeleton className="size-4 shrink-0" />
										<Skeleton
											className="h-4 w-(--layout-width)"

											style={
												{
													"--layout-width": layoutLength(
														`${45 + ((index * 17) % 40)}%`
													),
												} as React.CSSProperties
											}
										/>
									</span>
									<Skeleton className="hidden size-6 rounded-full md:block" />
									<Skeleton className="hidden h-4 w-24 md:block" />
									<Skeleton className="hidden h-4 w-14 md:block" />
									<span />
								</div>
							));
						}
						if (sorted.length === 0) {
							return (
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											{view === "trash" ? <Trash2 /> : <FolderOpen />}
										</EmptyMedia>
										<EmptyTitle>{emptyText}</EmptyTitle>
									</EmptyHeader>
								</Empty>
							);
						}
						return sorted.map((item) => {
							const { Icon, className } = driveIconFor(item);
							const dropTarget =
								item.kind === "folder" &&
								item.role === "owner" &&
								!item.trashedAt &&
								!item.source
									? driveDropHandlers(
											{ id: item.id, kind: "folder" },
											() => canDropDrive({ id: item.id, kind: "folder" }),
											t,
											(over) =>
												setDropFolder((previous) =>
													(() => {
														if (over) {
															return item.id;
														}
														if (previous === item.id) {
															return null;
														}
														return previous;
													})()
												)
										)
									: {};

							function renderItemName() {
								return (
									<Button
										variant="ghost"
										type="button"
										onClick={() => open(item)}
										aria-disabled={item.trashedAt ? true : undefined}
										className="w-full min-w-0 justify-start text-left aria-disabled:cursor-default"
									>
										<Icon
											data-icon="inline-start"
											className={clsx("shrink-0", className)}
											fill={item.kind === "folder" ? "currentColor" : "none"}
										/>
										<span className="truncate text-foreground">
											{item.name}
										</span>
										{item.shared && item.role === "owner" && (
											<Share2
												size={12}
												className="shrink-0 text-muted-foreground"
												aria-label={t("drive.share")}
											/>
										)}
									</Button>
								);
							}

							function renderItemRow() {
								function renderItemActions() {
									return (
										<DropdownMenu.DropdownMenu>
											<DropdownMenu.DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													type="button"
													aria-label={t("drive.actions")}
													size="icon"
												>
													<MoreVertical data-icon="inline-start" />
												</Button>
											</DropdownMenu.DropdownMenuTrigger>
											<DropdownMenu.DropdownMenuPortal>
												<DropdownMenu.DropdownMenuContent
													align="end"
													sideOffset={4}
												>
													<DropdownMenu.DropdownMenuGroup>
														{!item.trashedAt && (
															<DropdownMenu.DropdownMenuItem
																onSelect={() => open(item)}
															>
																{t("drive.open")}
															</DropdownMenu.DropdownMenuItem>
														)}
														{item.kind === "file" &&
															!(item.source && item.trashedAt) && (
																<DropdownMenu.DropdownMenuItem asChild>
																	<a href={driveFileUrl(item, true)}>
																		<Download size={16} />
																		{t("drive.download")}
																	</a>
																</DropdownMenu.DropdownMenuItem>
															)}
														{item.source && !item.trashedAt && (
															<DropdownMenu.DropdownMenuItem asChild>
																<a
																	href={emailUrl(item.source)}
																	target="_blank"
																	rel="noopener noreferrer"
																>
																	<Mail size={16} />
																	{t("drive.openEmail")}
																	<span className="sr-only">
																		{" "}
																		({t("common.opensInNewTab")})
																	</span>
																</a>
															</DropdownMenu.DropdownMenuItem>
														)}
														{item.role === "owner" && !item.trashedAt && (
															<DropdownMenu.DropdownMenuItem
																onSelect={() => setSharing(item)}
															>
																<Share2 size={16} />
																{t("drive.share")}
															</DropdownMenu.DropdownMenuItem>
														)}
														{canEditDrive(item.role) && !item.trashedAt && (
															<DropdownMenu.DropdownMenuItem
																onSelect={() =>
																	setNaming({
																		item,
																		mode: "rename",
																		value: item.name,
																	})
																}
															>
																<Pencil size={16} />
																{t("drive.rename")}
															</DropdownMenu.DropdownMenuItem>
														)}
														{item.source?.canDelete && !item.trashedAt && (
															<DropdownMenu.DropdownMenuItem
																onSelect={() =>
																	mutate(
																		"/api/drive/attachments",
																		json("POST", {
																			action: "trash",
																			ids: [item.id],
																		}),
																		t("drive.trashed")
																	)
																}
															>
																<Trash2 size={16} />
																{t("drive.moveToTrash")}
															</DropdownMenu.DropdownMenuItem>
														)}
														{canEditDrive(item.role) &&
															!item.source &&
															!item.trashedAt && (
																<DropdownMenu.DropdownMenuItem
																	onSelect={() =>
																		mutate(
																			`/api/drive/items/${item.id}`,
																			json("PATCH", { trashed: true }),
																			t("drive.trashed")
																		)
																	}
																>
																	<Trash2 size={16} />
																	{t("drive.moveToTrash")}
																</DropdownMenu.DropdownMenuItem>
															)}
														{item.trashedAt && (
															<DropdownMenu.DropdownMenuItem
																onSelect={() =>
																	item.source
																		? mutate(
																				"/api/drive/attachments",
																				json("POST", {
																					action: "restore",
																					ids: [item.id],
																				}),
																				t("drive.restored")
																			)
																		: mutate(
																				`/api/drive/items/${item.id}`,
																				json("PATCH", { trashed: false }),
																				t("drive.restored")
																			)
																}
															>
																<RotateCcw size={16} />
																{t("drive.restore")}
															</DropdownMenu.DropdownMenuItem>
														)}
														{item.trashedAt && (
															<DropdownMenu.DropdownMenuItem
																variant="destructive"
																onSelect={async () => {
																	if (
																		await confirm(
																			t("drive.confirmDelete", {
																				name: item.name,
																			})
																		)
																	) {
																		void (item.source
																			? mutate(
																					"/api/drive/attachments",
																					json("POST", {
																						action: "delete",
																						ids: [item.id],
																					}),
																					t("drive.deleted")
																				)
																			: mutate(
																					`/api/drive/items/${item.id}`,
																					{ method: "DELETE" },
																					t("drive.deleted")
																				));
																	}
																}}
															>
																<X size={16} />
																{t("drive.deleteForever")}
															</DropdownMenu.DropdownMenuItem>
														)}
													</DropdownMenu.DropdownMenuGroup>
												</DropdownMenu.DropdownMenuContent>
											</DropdownMenu.DropdownMenuPortal>
										</DropdownMenu.DropdownMenu>
									);
								}
								return (
									<li className={movingIds.has(item.id) ? "opacity-50" : ""}>
										<Checkbox
											checked={selectedIds.has(item.id)}
											onCheckedChange={() => toggleItem(item.id)}
											disabled={!selectable.includes(item)}
											aria-label={t("drive.selectItem", { name: item.name })}
											className={clsx(
												"ml-1",
												!selectable.includes(item) && "invisible"
											)}
										/>
										{renderItemName()}
										<span className="hidden md:block">
											<DriveOwnerAvatar item={item} />
										</span>
										<span className="hidden text-muted-foreground md:block">
											{dateFormat.format(new Date(item.updatedAt))}
										</span>
										<span className="hidden text-muted-foreground md:block">
											{item.kind === "file" ? formatDriveSize(item.size) : "—"}
										</span>
										{renderItemActions()}
									</li>
								);
							}
							return (
								<Item
									key={item.id}
									asChild
									style={gridStyle}
									draggable={isDriveDraggable(item)}
									onDragStart={(event) => onItemDragStart(event, item)}
									onDragEnd={onItemDragEnd}
									{...dropTarget}
									data-moving={movingIds.has(item.id)}
									variant={
										selectedIds.has(item.id) || dropFolder === item.id
											? "selected"
											: "default"
									}
									className="group grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center md:grid-cols-(--drive-columns)"
								>
									{renderItemRow()}
								</Item>
							);
						});
					})()}
				</div>
			</div>
		);
	}

	function renderDrivePage() {
		return (
			<div
				className="relative flex h-full min-h-0 flex-col"
				onDragEnter={onDragEnter}
				onDragOver={(event) => {
					if (canWrite && event.dataTransfer.types.includes("Files")) {
						event.preventDefault();
					}
				}}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
			>
				{headerTarget &&
					createPortal(
						<HeaderSearch
							value={search}
							onChange={setSearch}
							label={t("drive.search")}
							onSubmit={() =>
								router.push(
									search.trim()
										? `/drive?q=${encodeURIComponent(search.trim())}`
										: "/drive"
								)
							}
						/>,
						headerTarget
					)}
				<input
					ref={fileInput}
					type="file"
					multiple
					hidden
					onChange={(event) => {
						void upload([...(event.target.files ?? [])]);
						event.target.value = "";
					}}
				/>
				{renderDriveListing()}
				{dragging && (
					<div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-ring bg-signal-soft/80 text-signal">
						<UploadCloud size={28} />
						<span className="ml-3 text-base font-medium">
							{t("drive.fileUpload")}
						</span>
					</div>
				)}

				<Dialog
					open={!!naming}
					onOpenChange={(openState) => {
						if (!openState) {
							setNaming(null);
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>
								{naming?.mode === "create"
									? t("drive.newFolder")
									: t("drive.renameTitle")}
							</DialogTitle>
						</DialogHeader>
						<form onSubmit={submitName}>
							<FieldGroup>
								<Field>
									<FieldLabel>{t("drive.folderName")}</FieldLabel>
									<Input
										autoFocus
										value={naming?.value ?? ""}
										onChange={(event) =>
											setNaming(
												(previous) =>
													previous && { ...previous, value: event.target.value }
											)
										}
										onFocus={(event) => event.currentTarget.select()}
										aria-label={t("drive.folderName")}
										maxLength={255}
									/>
								</Field>
								<div className="flex justify-end gap-2">
									<Button
										type="button"
										variant="ghost"
										onClick={() => setNaming(null)}
									>
										{t("common.cancel")}
									</Button>
									<Button type="submit" disabled={!naming?.value.trim()}>
										{naming?.mode === "create"
											? t("drive.create")
											: t("drive.save")}
									</Button>
								</div>
							</FieldGroup>
						</form>
					</DialogContent>
				</Dialog>

				<Dialog
					open={!!preview}
					onOpenChange={(openState) => {
						if (!openState) {
							setPreview(null);
						}
					}}
				>
					<DialogContent className="h-[min(85vh,900px)] w-[min(1100px,calc(100vw-32px))] max-w-none overflow-hidden">
						{preview && (
							<div className="flex h-full flex-col">
								<DialogTitle className="flex shrink-0 items-center justify-between">
									<span className="truncate text-base font-medium">
										{preview.name}
									</span>
									<span className="flex shrink-0 items-center gap-1">
										{preview.source && (
											<Button asChild variant="ghost" size="sm">
												<a
													href={emailUrl(preview.source)}
													target="_blank"
													rel="noopener noreferrer"
												>
													<Mail />
													{t("drive.openEmail")}
													<ExternalLink className="size-3" aria-hidden="true" />
													<span className="sr-only">
														{" "}
														({t("common.opensInNewTab")})
													</span>
												</a>
											</Button>
										)}
										<Button asChild variant="ghost" size="icon">
											<a
												href={driveFileUrl(preview, true)}
												aria-label={t("drive.download")}
											>
												<Download />
											</a>
										</Button>
									</span>
								</DialogTitle>
								<div className="min-h-0 flex-1 p-3 pt-0">
									<DrivePreviewBody
										src={driveFileUrl(preview)}
										downloadHref={driveFileUrl(preview, true)}
										contentType={preview.contentType}
										name={preview.name}
									/>
								</div>
							</div>
						)}
					</DialogContent>
				</Dialog>

				{confirmation}
				<DriveUploadPanel
					uploads={uploads}
					onClose={() =>
						setUploads((list) =>
							list.filter(
								(entry) =>
									entry.status === "queued" || entry.status === "uploading"
							)
						)
					}
				/>

				<DriveShareDialog
					item={sharing}
					onClose={() => setSharing(null)}
					onChanged={() => refresh()}
				/>
			</div>
		);
	}
	return renderDrivePage();
}
