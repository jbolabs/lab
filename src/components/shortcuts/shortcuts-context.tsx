"use client";

import {
	Inbox,
	Star,
	Clock,
	Send,
	FileText,
	Archive,
	ShieldAlert,
	Trash2,
	MailPlus,
	Settings,
	HelpCircle,
} from "lucide-react";
import React, {
	createContext,
	useContext,
	useState,
	useMemo,
	useCallback,
} from "react";

import { useCompose } from "@/components/compose/compose-context";
import { useLanguage } from "@/components/language-provider";
import { useRouter } from "@/lib/navigation";

import { CommandPalette } from "./command-palette";
import { ShortcutsHelpDialog } from "./shortcuts-help-dialog";
import type { ShortcutDefinition, CommandItem } from "./types";
import { useHotkeys } from "./use-hotkeys";
import { useShortcutsEnabled } from "./use-shortcuts-enabled";

interface ShortcutsContextValue {
	shortcutsEnabled: boolean;
	shortcutsPreferenceLoading: boolean;
	shortcutsPreferenceError: string | null;
	setShortcutsEnabled: (enabled: boolean) => Promise<void>;
	openCommandPalette: () => void;
	closeCommandPalette: () => void;
	openHelpModal: () => void;
	closeHelpModal: () => void;
	registerShortcut: (shortcut: ShortcutDefinition) => void;
	registerCommand: (command: CommandItem) => void;
	shortcuts: ShortcutDefinition[];
	commands: CommandItem[];
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function useShortcuts() {
	const ctx = useContext(ShortcutsContext);
	if (!ctx) {
		throw new Error("useShortcuts must be used within a ShortcutsProvider");
	}
	return ctx;
}

const EMPTY_SHORTCUTS: ShortcutDefinition[] = [];
const EMPTY_COMMANDS: CommandItem[] = [];

export function ShortcutsProvider({
	children,
	extraShortcuts = EMPTY_SHORTCUTS,
	extraCommands = EMPTY_COMMANDS,
}: {
	children: React.ReactNode;
	extraShortcuts?: ShortcutDefinition[];
	extraCommands?: CommandItem[];
}) {
	const { t } = useLanguage();
	const router = useRouter();
	const { openComposer } = useCompose();
	const {
		enabled: shortcutsEnabled,
		error: shortcutsPreferenceError,
		isLoading: shortcutsPreferenceLoading,
		setEnabled: setShortcutsEnabled,
	} = useShortcutsEnabled();

	const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
	const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
	const [customShortcuts, setCustomShortcuts] =
		useState<ShortcutDefinition[]>(extraShortcuts);
	const [customCommands, setCustomCommands] =
		useState<CommandItem[]>(extraCommands);

	const openCommandPalette = useCallback(() => {
		if (shortcutsEnabled && !shortcutsPreferenceLoading) {
			setIsCommandPaletteOpen(true);
		}
	}, [shortcutsEnabled, shortcutsPreferenceLoading]);
	const closeCommandPalette = useCallback(
		() => setIsCommandPaletteOpen(false),
		[]
	);
	const openHelpModal = useCallback(() => {
		if (shortcutsEnabled && !shortcutsPreferenceLoading) {
			setIsHelpModalOpen(true);
		}
	}, [shortcutsEnabled, shortcutsPreferenceLoading]);
	const closeHelpModal = useCallback(() => setIsHelpModalOpen(false), []);

	const registerShortcut = useCallback((shortcut: ShortcutDefinition) => {
		setCustomShortcuts((prev) => {
			const idx = prev.findIndex((s) => s.key === shortcut.key);
			if (idx !== -1) {
				const next = [...prev];
				next[idx] = shortcut;
				return next;
			}
			return [...prev, shortcut];
		});
	}, []);

	const registerCommand = useCallback((command: CommandItem) => {
		setCustomCommands((prev) => {
			const idx = prev.findIndex((c) => c.id === command.id);
			if (idx !== -1) {
				const next = [...prev];
				next[idx] = command;
				return next;
			}
			return [...prev, command];
		});
	}, []);

	// Base navigation and global shortcuts
	const baseShortcuts = useMemo<ShortcutDefinition[]>(
		() => [
			{
				action: () => setIsCommandPaletteOpen((prev) => !prev),
				category: "General",
				key: "k",
				label: t("shortcut.commandPalette"),
				modifiers: ["meta", "ctrl"],
			},
			{
				action: () => setIsHelpModalOpen((prev) => !prev),
				category: "General",
				key: "?",
				label: t("shortcut.cheatSheet"),
			},
			{
				action: () => openComposer(),
				category: "Composing",
				key: "c",
				label: t("shortcut.compose"),
			},
			{
				action: () => {
					const searchInput = document.querySelector<HTMLInputElement>(
						"input[data-mail-search-input]"
					);
					if (searchInput) {
						searchInput.focus();
						searchInput.select();
					}
				},
				category: "Navigation",
				key: "/",
				label: t("shortcut.searchMail"),
			},
			{
				action: () => router.push("/inbox"),
				category: "Navigation",
				key: "g i",
				label: t("shortcut.goInbox"),
			},
			{
				action: () => router.push("/starred"),
				category: "Navigation",
				key: "g s",
				label: t("shortcut.goStarred"),
			},
			{
				action: () => router.push("/snoozed"),
				category: "Navigation",
				key: "g z",
				label: t("shortcut.goSnoozed"),
			},
			{
				action: () => router.push("/sent"),
				category: "Navigation",
				key: "g t",
				label: t("shortcut.goSent"),
			},
			{
				action: () => router.push("/drafts"),
				category: "Navigation",
				key: "g d",
				label: t("shortcut.goDrafts"),
			},
			{
				action: () => router.push("/archived"),
				category: "Navigation",
				key: "g a",
				label: t("shortcut.goArchived"),
			},
			{
				action: () => router.push("/spam"),
				category: "Navigation",
				key: "g !",
				label: t("shortcut.goSpam"),
			},
			{
				action: () => router.push("/trash"),
				category: "Navigation",
				key: "g x",
				label: t("shortcut.goTrash"),
			},
			{
				action: () => {
					setIsCommandPaletteOpen(false);
					setIsHelpModalOpen(false);
				},
				category: "General",
				key: "escape",
				label: t("shortcut.dismiss"),
			},
			...customShortcuts,
		],
		[router, openComposer, customShortcuts, t]
	);

	useHotkeys(baseShortcuts, {
		enabled: shortcutsEnabled && !shortcutsPreferenceLoading,
	});

	// Base Command Palette actions
	const allCommands = useMemo<CommandItem[]>(() => {
		const builtins: CommandItem[] = [
			{
				category: "Actions",
				icon: MailPlus,
				id: "compose",
				perform: () => openComposer(),
				shortcut: "c",
				subtitle: t("palette.composeSubtitle"),
				title: t("palette.composeTitle"),
			},
			{
				category: "Navigation",
				icon: Inbox,
				id: "nav-inbox",
				perform: () => router.push("/inbox"),
				shortcut: "g i",
				title: t("shortcut.goInbox"),
			},
			{
				category: "Navigation",
				icon: Star,
				id: "nav-starred",
				perform: () => router.push("/starred"),
				shortcut: "g s",
				title: t("shortcut.goStarred"),
			},
			{
				category: "Navigation",
				icon: Clock,
				id: "nav-snoozed",
				perform: () => router.push("/snoozed"),
				shortcut: "g z",
				title: t("shortcut.goSnoozed"),
			},
			{
				category: "Navigation",
				icon: Send,
				id: "nav-sent",
				perform: () => router.push("/sent"),
				shortcut: "g t",
				title: t("shortcut.goSent"),
			},
			{
				category: "Navigation",
				icon: FileText,
				id: "nav-drafts",
				perform: () => router.push("/drafts"),
				shortcut: "g d",
				title: t("shortcut.goDrafts"),
			},
			{
				category: "Navigation",
				icon: Archive,
				id: "nav-archived",
				perform: () => router.push("/archived"),
				shortcut: "g a",
				title: t("shortcut.goArchived"),
			},
			{
				category: "Navigation",
				icon: ShieldAlert,
				id: "nav-spam",
				perform: () => router.push("/spam"),
				shortcut: "g !",
				title: t("shortcut.goSpam"),
			},
			{
				category: "Navigation",
				icon: Trash2,
				id: "nav-trash",
				perform: () => router.push("/trash"),
				shortcut: "g x",
				title: t("shortcut.goTrash"),
			},
			{
				category: "Settings",
				icon: Settings,
				id: "settings-account",
				perform: () => router.push("/settings/account"),
				subtitle: t("palette.accountSubtitle"),
				title: t("palette.accountTitle"),
			},
			{
				category: "General",
				icon: HelpCircle,
				id: "show-help",
				perform: () => setIsHelpModalOpen(true),
				shortcut: "?",
				subtitle: t("palette.helpSubtitle"),
				title: t("palette.helpTitle"),
			},
		];

		return [...builtins, ...customCommands];
	}, [router, openComposer, customCommands, t]);

	const contextValue = useMemo<ShortcutsContextValue>(
		() => ({
			closeCommandPalette,
			closeHelpModal,
			commands: allCommands,
			openCommandPalette,
			openHelpModal,
			registerCommand,
			registerShortcut,
			setShortcutsEnabled,
			shortcuts: baseShortcuts,
			shortcutsEnabled,
			shortcutsPreferenceError,
			shortcutsPreferenceLoading,
		}),
		[
			closeCommandPalette,
			closeHelpModal,
			allCommands,
			openCommandPalette,
			openHelpModal,
			registerCommand,
			registerShortcut,
			setShortcutsEnabled,
			baseShortcuts,
			shortcutsEnabled,
			shortcutsPreferenceError,
			shortcutsPreferenceLoading,
		]
	);
	return (
		<ShortcutsContext.Provider value={contextValue}>
			{children}
			{shortcutsEnabled && !shortcutsPreferenceLoading && (
				<>
					<CommandPalette
						isOpen={isCommandPaletteOpen}
						onClose={closeCommandPalette}
						commands={allCommands}
					/>
					<ShortcutsHelpDialog
						isOpen={isHelpModalOpen}
						onClose={closeHelpModal}
						shortcuts={baseShortcuts}
					/>
				</>
			)}
		</ShortcutsContext.Provider>
	);
}
