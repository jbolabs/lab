"use client";

import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { useLanguage } from "./language-provider";
import { useShortcuts } from "./shortcuts/shortcuts-context";
import { useSidebar } from "./sidebar-state";

export function SidebarFooter() {
	const { t } = useLanguage();
	const { minimal } = useSidebar();
	const { openHelpModal, shortcutsEnabled, shortcutsPreferenceLoading } =
		useShortcuts();
	if (minimal || !shortcutsEnabled || shortcutsPreferenceLoading) {
		return null;
	}

	// Keyboard shortcuts are a desktop affordance; phones get no footer at all.
	return (
		<div className="px-3 pt-3 max-md:hidden">
			<Button
				variant="ghost"
				size="sm"
				type="button"
				onClick={openHelpModal}
				className="w-full justify-between"
			>
				<span className="flex items-center gap-1.5">
					<Keyboard data-icon="inline-start" />
					{t("navigation.shortcuts")}
				</span>
				<Kbd>?</Kbd>
			</Button>
		</div>
	);
}
