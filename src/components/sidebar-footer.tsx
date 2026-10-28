"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import packageJson from "../../package.json";
import { useSidebar } from "./sidebar-state";
import { useShortcuts } from "./shortcuts";
import { Keyboard } from "lucide-react";
import { useLanguage } from "./language-provider";

export function SidebarFooter() {
	const { t } = useLanguage();
	const { minimal } = useSidebar();
	const { openHelpModal, shortcutsEnabled, shortcutsPreferenceLoading } =
		useShortcuts();
	if (minimal) return null;

	return (
		<div className="px-3 pt-3 flex flex-col gap-2">
			{shortcutsEnabled && !shortcutsPreferenceLoading && (
				<Button
					variant="ghost"
					size="sm"
					type="button"
					onClick={openHelpModal}
					className="w-full justify-between max-md:min-h-11"
				>
					<span className="flex items-center gap-1.5">
						<Keyboard data-icon="inline-start" />
						{t("navigation.shortcuts")}
					</span>
					<Kbd>?</Kbd>
				</Button>
			)}
			<PoweredBy />
		</div>
	);
}

/** The application source link, shared by the mail and Drive sidebars. */
export function PoweredBy({ className = "px-1" }: { className?: string }) {
	const { t } = useLanguage();
	return (
		<p className={`${className} text-[11px] text-muted-foreground`}>
			{t("navigation.poweredBy")}{" "}
			<a
				href="https://github.com/jbolabs/lab"
				target="_blank"
				className="hover:underline text-muted-foreground"
				rel="noreferrer"
			>
				Lab v{packageJson.version}
			</a>
		</p>
	);
}
