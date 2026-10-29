import type React from "react";

export type ModifierKey = "ctrl" | "meta" | "alt" | "shift";

export interface ShortcutDefinition {
	// e.g., 'j', 'k', 'e', 'c', '?', '/' or sequences like 'g i'
	key: string;
	// e.g., 'Next conversation'
	label: string;
	category: "Navigation" | "Actions" | "Composing" | "Selection" | "General";
	description?: string;
	modifiers?: ModifierKey[];
	allowInInputs?: boolean;
	action: () => void;
}

export interface CommandItem {
	id: string;
	title: string;
	subtitle?: string;
	category: "Actions" | "Navigation" | "Settings" | "Mailboxes" | "General";
	icon?: React.ComponentType<{ className?: string }>;
	shortcut?: string;
	keywords?: string[];
	perform: () => void;
}

export interface ShortcutsSettingsResponse {
	enabled?: boolean;
	error?: unknown;
}
