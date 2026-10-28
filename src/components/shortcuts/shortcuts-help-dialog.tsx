"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { X, Keyboard } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import type { ShortcutDefinition } from "./types";

interface ShortcutsHelpDialogProps {
	isOpen: boolean;
	onClose: () => void;
	shortcuts: ShortcutDefinition[];
}

// Puts a styled key badge where the translation has its {key} placeholder.
function withKey(text: string, key: string) {
	const [before, after = ""] = text.split("{key}");
	return (
		<>
			{before}
			<Kbd>{key}</Kbd>
			{after}
		</>
	);
}

export function ShortcutsHelpDialog({
	isOpen,
	onClose,
	shortcuts,
}: ShortcutsHelpDialogProps) {
	if (!isOpen) return null;
	return <ShortcutsHelpDialogContent onClose={onClose} shortcuts={shortcuts} />;
}

function ShortcutsHelpDialogContent({
	onClose,
	shortcuts,
}: Omit<ShortcutsHelpDialogProps, "isOpen">) {
	const { t } = useLanguage();

	const grouped = shortcuts.reduce(
		(acc, item) => {
			if (!acc[item.category]) acc[item.category] = [];
			acc[item.category].push(item);
			return acc;
		},
		{} as Record<string, ShortcutDefinition[]>,
	);

	const formatKey = (shortcut: ShortcutDefinition) => {
		const parts: string[] = [];
		if (shortcut.modifiers) {
			shortcut.modifiers.forEach((m) => {
				if (m === "ctrl") parts.push(t("shortcutsHelp.ctrl"));
				if (m === "meta") parts.push("⌘");
				if (m === "alt") parts.push("Alt");
				if (m === "shift") parts.push("Shift");
			});
		}
		parts.push(shortcut.key.toUpperCase());
		return parts.join(" + ");
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="flex max-h-[85dvh] flex-col overflow-hidden p-0 sm:max-w-2xl"
				onKeyDown={(event) => {
					if (event.key === "?") {
						event.stopPropagation();
						onClose();
					}
				}}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-border">
					<div className="flex items-center gap-2.5">
						<div className="p-1.5 bg-signal-soft text-signal rounded-lg">
							<Keyboard className="w-5 h-5" />
						</div>
						<div>
							<DialogTitle>{t("shortcutsHelp.title")}</DialogTitle>
							<DialogDescription>
								{t("shortcutsHelp.subtitle")}
							</DialogDescription>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						onClick={onClose}
						aria-label={t("shortcutsHelp.close")}
						className="size-11"
					>
						<X />
					</Button>
				</div>

				{/* Categories */}
				<div className="overflow-y-auto overscroll-contain p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
					{Object.entries(grouped).map(([category, items]) => (
						<div key={category} className="flex flex-col gap-3">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
								{t(`shortcut.category.${category}` as TranslationKey)}
							</h3>
							<div className="flex flex-col gap-2">
								{items.map((item, idx) => (
									<div
										key={idx}
										className="flex items-center justify-between text-sm"
									>
										<span className="text-foreground/80">{item.label}</span>
										<Kbd>{formatKey(item)}</Kbd>
									</div>
								))}
							</div>
						</div>
					))}
				</div>

				{/* Footer */}
				<div className="px-6 py-3 bg-muted/60 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{withKey(t("shortcutsHelp.pressToToggle", { key: "{key}" }), "?")}
					</span>
					<span>
						{withKey(t("shortcutsHelp.pressToClose", { key: "{key}" }), "ESC")}
					</span>
				</div>
			</DialogContent>
		</Dialog>
	);
}
