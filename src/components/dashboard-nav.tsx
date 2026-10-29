"use client";

import {
	ChevronUp,
	ChevronDown,
	Archive,
	CalendarClock,
	Clock,
	FileText,
	Folder,
	Inbox,
	MailPlus,
	Plus,
	Send,
	ShieldAlert,
	Star,
	Trash2,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldSet,
	FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useMessageCounts } from "@/hooks/use-message-counts";
import { withCleanup } from "@/lib/async-cleanup";
import { AUTH_SESSION_CHANGED_EVENT, authFetch } from "@/lib/auth/client";
import { getMailboxFolders, invalidateFolderCache } from "@/lib/folders/client";
import { folderColorKeys } from "@/lib/folders/color-keys";
import {
	DEFAULT_FOLDER_COLOR,
	FOLDER_COLOR_OPTIONS,
} from "@/lib/folders/colors";
import type { FolderColor } from "@/lib/folders/types";
import type { TranslationKey } from "@/lib/i18n/types";

import { NavItem } from "./components-nav";
import type { NavLink } from "./components-nav-types";
import type { CustomFolder } from "./dashboard-nav-types";
import {
	getFolderNavCount,
	moveMessagesToCustomFolder,
	moveMessagesToSystemFolder,
} from "./dashboard-nav-utils";
import { useLanguage } from "./language-provider";
import { NavSectionHeader, useSectionOpen } from "./nav-section-header";
import { ReorderableList } from "./reorderable-list";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarHeader } from "./sidebar-header";
import { SidebarScaffold } from "./sidebar-scaffold";
import { useSidebar } from "./sidebar-state";

const links = [
	{
		href: "/compose",
		icon: MailPlus,
		labelKey: "navigation.compose",
		primary: true,
	},
	{
		href: "/inbox",
		icon: Inbox,
		labelKey: "navigation.inbox",
		preloadMessages: true,
	},
	{
		href: "/starred",
		icon: Star,
		labelKey: "navigation.starred",
		preloadMessages: true,
	},
	{
		href: "/snoozed",
		icon: Clock,
		labelKey: "navigation.snoozed",
		preloadMessages: true,
	},
	{
		href: "/sent",
		icon: Send,
		labelKey: "navigation.sent",
		preloadMessages: true,
	},
	{
		href: "/scheduled",
		icon: CalendarClock,
		labelKey: "navigation.scheduled",
		preloadMessages: true,
	},
	{
		href: "/drafts",
		icon: FileText,
		labelKey: "navigation.drafts",
		preloadMessages: true,
	},
	{
		href: "/archived",
		icon: Archive,
		labelKey: "navigation.archived",
		preloadMessages: true,
	},
	{
		href: "/spam",
		icon: ShieldAlert,
		labelKey: "navigation.spam",
		preloadMessages: true,
	},
	{
		href: "/trash",
		icon: Trash2,
		labelKey: "navigation.trash",
		preloadMessages: true,
	},
] satisfies (Omit<NavLink, "label"> & { labelKey: TranslationKey })[];

// Drafts, Archived, Spam and Trash start tucked under "More...".
const MORE_LINK_HREFS = new Set(["/drafts", "/archived", "/spam", "/trash"]);
const MAX_VISIBLE_FOLDERS = 3;
const MORE_OPEN_KEY = "mailflare:nav:more-open";
const FOLDERS_OPEN_KEY = "mailflare:nav:folders-open";

function NavToggle({
	expanded,
	onClick,
	collapsedLabel,
	expandedLabel,
}: {
	expanded: boolean;
	onClick: () => void;
	collapsedLabel?: string;
	expandedLabel?: string;
}) {
	const { t } = useLanguage();
	return (
		<Button
			variant="ghost"
			type="button"
			onClick={onClick}
			aria-expanded={expanded}
			size="default"
			className="w-full justify-start text-muted-foreground"
		>
			{expanded ? (
				<ChevronUp data-icon="inline-start" />
			) : (
				<ChevronDown data-icon="inline-start" />
			)}
			{expanded
				? (expandedLabel ?? t("navigation.less"))
				: (collapsedLabel ?? t("navigation.more"))}
		</Button>
	);
}

export function DashboardNav({ className }: { className?: string }) {
	const { t } = useLanguage();
	const { minimal, mobile } = useSidebar();
	const pathname = usePathname();
	const [moreOpen, toggleMore] = useSectionOpen(MORE_OPEN_KEY, false);
	const [foldersOpen, toggleFolders] = useSectionOpen(FOLDERS_OPEN_KEY, false);
	const [foldersSectionOpen, toggleFoldersSection] = useSectionOpen(
		"mailflare:nav:folders-section-open"
	);
	const { selectedMailbox, isLoading } = useSelectedMailbox();
	const { counts } = useMessageCounts(selectedMailbox?.id, !isLoading);
	const [loadedFolders, setLoadedFolders] = useState<CustomFolder[]>([]);
	const folders = selectedMailbox ? loadedFolders : [];
	const [newFolderName, setNewFolderName] = useState("");
	const [newFolderColor, setNewFolderColor] =
		useState<FolderColor>(DEFAULT_FOLDER_COLOR);
	const [addingFolder, setAddingFolder] = useState(false);
	const [folderDialogOpen, setFolderDialogOpen] = useState(false);
	const linksWithCounts: NavLink[] = links
		.filter(
			(link) => link.href !== "/scheduled" || counts.folders.scheduled.total > 0
		)
		.map(({ labelKey, ...rest }): NavLink => {
			const link = { ...rest, label: t(labelKey) };
			if (link.href === "/inbox") {
				return { ...link, count: getFolderNavCount("inbox", counts.folders) };
			}
			if (link.href === "/starred") {
				return { ...link, count: getFolderNavCount("starred", counts.folders) };
			}
			if (link.href === "/snoozed") {
				return { ...link, count: getFolderNavCount("snoozed", counts.folders) };
			}
			if (link.href === "/sent") {
				return { ...link, count: getFolderNavCount("sent", counts.folders) };
			}
			if (link.href === "/scheduled") {
				return { ...link, count: counts.folders.scheduled.total };
			}
			if (link.href === "/drafts") {
				return { ...link, count: getFolderNavCount("drafts", counts.folders) };
			}
			if (link.href === "/archived") {
				return {
					...link,
					count: getFolderNavCount("archived", counts.folders),
					onMessageDrop: (messageIds: string[]) =>
						moveMessagesToSystemFolder(messageIds, "archive"),
				};
			}
			if (link.href === "/spam") {
				return {
					...link,
					count: getFolderNavCount("spam", counts.folders),
					onMessageDrop: (messageIds: string[]) =>
						moveMessagesToSystemFolder(messageIds, "spam"),
				};
			}
			if (link.href === "/trash") {
				return {
					...link,
					count: getFolderNavCount("trash", counts.folders),
					onMessageDrop: (messageIds: string[]) =>
						moveMessagesToSystemFolder(messageIds, "trash"),
				};
			}
			return link;
		});

	useEffect(() => {
		const reset = () => setLoadedFolders([]);
		window.addEventListener(AUTH_SESSION_CHANGED_EVENT, reset);
		return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, reset);
	}, []);

	const isActiveHref = (href: string) =>
		pathname === href || pathname.startsWith(`${href}/`);
	const composeLink = linksWithCounts.find((link) => link.href === "/compose");
	const mainLinks = linksWithCounts.filter(
		(link) => link.href !== "/compose" && !MORE_LINK_HREFS.has(link.href ?? "")
	);
	const moreLinks = linksWithCounts.filter((link) =>
		MORE_LINK_HREFS.has(link.href ?? "")
	);
	// The icon rail has no room for text toggles. When collapsed, the page you are on stays listed on its own.
	const showAllMoreLinks = minimal || moreOpen;
	const foldersOverflow = !minimal && folders.length > MAX_VISIBLE_FOLDERS;

	useEffect(() => {
		if (!selectedMailbox?.id) {
			return;
		}

		let cancelled = false;
		getMailboxFolders<{ folders?: CustomFolder[] }>(selectedMailbox.id)
			.then((data) => {
				if (!cancelled) {
					setLoadedFolders(data.folders ?? []);
				}

				return null;
			})
			.catch(() => {
				if (!cancelled) {
					setLoadedFolders([]);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [selectedMailbox?.id]);

	async function createFolder(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox?.id || !newFolderName.trim()) {
			return;
		}

		setAddingFolder(true);
		return await withCleanup(
			async () => {
				const response = await authFetch("/api/folders", {
					body: JSON.stringify({
						color: newFolderColor,
						mailboxId: selectedMailbox.id,
						name: newFolderName,
					}),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				});
				if (!response.ok) {
					return;
				}
				const folder = (await response.json()) as CustomFolder;
				invalidateFolderCache();
				setLoadedFolders((items) =>
					[...items, folder].toSorted((a, b) => a.name.localeCompare(b.name))
				);
				setNewFolderName("");
				setNewFolderColor(DEFAULT_FOLDER_COLOR);
				setFolderDialogOpen(false);
			},
			() => {
				setAddingFolder(false);
			}
		);
	}
	function renderNavigation() {
		return (
			<SidebarScaffold
				className={className}
				header={<SidebarHeader href="/" app="inbox" />}
				footer={<SidebarFooter />}
			>
				{composeLink && !mobile && (
					<NavItem labelClassName="font-medium" link={composeLink} />
				)}
				{minimal && <Separator className="my-2" />}
				<ReorderableList
					storageKey="mailflare:nav:layout"
					enabled={!minimal}
					lists={[
						{
							id: "main",
							items: mainLinks.map((link) => ({
								id: link.href ?? "",
								node: <NavItem link={link} />,
							})),
						},
						{
							before: minimal ? undefined : (
								<NavToggle expanded={moreOpen} onClick={toggleMore} />
							),
							id: "more",
							items: moreLinks.map((link) => ({
								id: link.href ?? "",
								node: <NavItem link={link} />,
							})),
							visibleIds: (ordered) =>
								showAllMoreLinks
									? ordered
									: ordered.filter((id) => isActiveHref(id)),
						},
					]}
				/>
				{minimal && <Separator className="my-2" />}
				{!minimal && (
					<NavSectionHeader
						label={t("navigation.folders")}
						open={foldersSectionOpen}
						onToggle={toggleFoldersSection}
					>
						{selectedMailbox && (
							<Dialog
								open={folderDialogOpen}
								onOpenChange={setFolderDialogOpen}
							>
								<DialogTrigger asChild>
									<Button
										variant="ghost"
										size="icon-sm"
										type="button"
										aria-label={t("navigation.createFolder")}
									>
										<Plus />
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>{t("navigation.createFolder")}</DialogTitle>
										<DialogDescription>
											{t("navigation.folderDescription")}
										</DialogDescription>
									</DialogHeader>
									<form onSubmit={createFolder}>
										<FieldGroup>
											<Field>
												<FieldLabel htmlFor="folderName">
													{t("navigation.folderName")}
												</FieldLabel>
												<Input
													id="folderName"
													value={newFolderName}
													onChange={(event) =>
														setNewFolderName(event.target.value)
													}
													placeholder={t("navigation.folderExample")}
													autoFocus
												/>
											</Field>
											<FieldSet>
												<FieldLegend variant="label">
													{t("navigation.color")}
												</FieldLegend>
												<RadioGroup
													value={newFolderColor}
													onValueChange={(value) =>
														setNewFolderColor(value as FolderColor)
													}
													aria-label={t("navigation.folderColor")}
													className="flex flex-wrap"
												>
													{FOLDER_COLOR_OPTIONS.map((option) => (
														<Field
															key={option.value}
															orientation="horizontal"
															className="w-auto"
														>
															<RadioGroupItem
																id={`folder-color-${option.value}`}
																value={option.value}
																aria-label={t(folderColorKeys[option.value])}
															/>
															<FieldLabel
																htmlFor={`folder-color-${option.value}`}
															>
																<span
																	className="size-3 rounded-full bg-(--folder-color)"
																	style={
																		{
																			"--folder-color": option.value,
																		} as React.CSSProperties
																	}
																/>
																{t(folderColorKeys[option.value])}
															</FieldLabel>
														</Field>
													))}
												</RadioGroup>
											</FieldSet>
											<Button
												type="submit"
												disabled={addingFolder || !newFolderName.trim()}
											>
												{addingFolder
													? t("navigation.creating")
													: t("navigation.createFolder")}
											</Button>
										</FieldGroup>
									</form>
								</DialogContent>
							</Dialog>
						)}
					</NavSectionHeader>
				)}

				{!minimal && foldersSectionOpen && folders.length === 0 && (
					<div className="px-4 py-1.5 text-xs text-muted-foreground">
						{t("navigation.noFolders")}
					</div>
				)}
				{(minimal || foldersSectionOpen) && (
					<ReorderableList
						storageKey="mailflare:nav:layout:folders"
						enabled={!minimal}
						lists={[
							{
								id: "folders",
								items: folders.map((folder) => ({
									id: folder.id,
									node: (
										<NavItem
											wrap
											link={{
												count: counts.customFolders[folder.id]?.unread,
												href: `/folders/${folder.id}`,
												icon: Folder,
												iconColor: folder.color,
												label: folder.name,
												onMessageDrop: (messageIds: string[]) =>
													moveMessagesToCustomFolder(messageIds, folder.id),
												preloadMessages: true,
											}}
										/>
									),
								})),
								visibleIds: (ordered) => {
									if (!foldersOverflow || foldersOpen) {
										return ordered;
									}
									const first = ordered.slice(0, MAX_VISIBLE_FOLDERS);
									const active = ordered
										.slice(MAX_VISIBLE_FOLDERS)
										.find((id) => isActiveHref(`/folders/${id}`));
									return active ? [...first, active] : first;
								},
							},
						]}
					/>
				)}
				{foldersSectionOpen && foldersOverflow && (
					<NavToggle expanded={foldersOpen} onClick={toggleFolders} />
				)}
			</SidebarScaffold>
		);
	}

	return renderNavigation();
}
