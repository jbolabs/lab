"use client";

import { X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { HeaderSearch } from "@/components/header-search";
import { useMailSearch } from "./mail-search-context";
import { useShortcuts } from "@/components/shortcuts";

export function MailSearchInput({ mobileEnd }: { mobileEnd?: boolean }) {
	const { t } = useLanguage();
	const { input: query, setQuery } = useMailSearch();
	const { openCommandPalette, shortcutsEnabled, shortcutsPreferenceLoading } = useShortcuts();
	const showShortcutHints = shortcutsEnabled && !shortcutsPreferenceLoading;

	return (
		<HeaderSearch
			value={query}
			onChange={setQuery}
			label={t("search.mail")}
			mobileEnd={mobileEnd}
			placeholder={showShortcutHints ? t("search.mailHint") : t("search.mail")}
			inputProps={{ "data-mail-search-input": "" }}
			trailing={query ? (
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => setQuery("")}
					className="rounded-full p-1 text-muted-foreground hover:bg-signal-soft hover:text-foreground"
					aria-label={t("search.clear")}
				>
					<X className="h-4 w-4" />
				</button>
			) : showShortcutHints ? (
				<button
					type="button"
					onClick={openCommandPalette}
					className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-muted-foreground bg-background/70 hover:bg-card border border-border/80 rounded-md shadow-2xs transition-colors"
					title={t("search.openPalette")}
				>
					<span className="text-[11px] font-mono">⌘K</span>
				</button>
			) : null}
		/>
	);
}
