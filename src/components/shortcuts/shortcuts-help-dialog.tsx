"use client";

import { X, Keyboard } from "lucide-react";
import React from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
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

function ShortcutsHelpDialogContent({
	onClose,
	shortcuts,
}: Omit<ShortcutsHelpDialogProps, "isOpen">) {
	const { t } = useLanguage();

	const grouped: Record<string, ShortcutDefinition[]> = {};
	for (const item of shortcuts) {
		const category = grouped[item.category] ?? [];
		category.push(item);
		grouped[item.category] = category;
	}

	const formatKey = (shortcut: ShortcutDefinition) => {
		const parts: string[] = [];
		if (shortcut.modifiers) {
			for (const m of shortcut.modifiers) {
				if (m === "ctrl") {
					parts.push(t("shortcutsHelp.ctrl"));
				}
				if (m === "meta") {
					parts.push("⌘");
				}
				if (m === "alt") {
					parts.push("Alt");
				}
				if (m === "shift") {
					parts.push("Shift");
				}
			}
		}
		parts.push(shortcut.key.toUpperCase());
		return parts.join(" + ");
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl"
				onKeyDown={(event) => {
					if (event.key === "?") {
						event.stopPropagation();
						onClose();
					}
				}}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-6 py-4">
					<div className="flex items-center gap-2.5">
						<div className="rounded-lg bg-signal-soft p-1.5 text-signal">
							<Keyboard className="h-5 w-5" />
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
					>
						<X />
					</Button>
				</div>

				{/* Categories */}
				<div className="grid grid-cols-1 gap-6 overflow-y-auto overscroll-contain p-6 md:grid-cols-2">
					{Object.entries(grouped).map(([category, items]) => (
						<div key={category} className="flex flex-col gap-3">
							<h3 className="border-b border-border pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
				<div className="flex items-center justify-between border-t border-border bg-muted/60 px-6 py-3 text-xs text-muted-foreground">
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

export function ShortcutsHelpDialog({
	isOpen,
	onClose,
	shortcuts,
}: ShortcutsHelpDialogProps) {
	if (!isOpen) {
		return null;
	}
	return <ShortcutsHelpDialogContent onClose={onClose} shortcuts={shortcuts} />;
}
