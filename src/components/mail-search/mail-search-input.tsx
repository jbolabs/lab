"use client";

import { X } from "lucide-react";

import { HeaderSearch } from "@/components/header-search";
import { useLanguage } from "@/components/language-provider";
import { useShortcuts } from "@/components/shortcuts/shortcuts-context";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { useMailSearch } from "./mail-search-context";

export function MailSearchInput({ mobileEnd }: { mobileEnd?: boolean }) {
	const { t } = useLanguage();
	const { input: query, setQuery } = useMailSearch();
	const { openCommandPalette, shortcutsEnabled, shortcutsPreferenceLoading } =
		useShortcuts();
	// Keyboard hints mean nothing on a phone, and the long placeholder crowds its search bar.
	const isMobile = useIsMobile();
	const showShortcutHints =
		shortcutsEnabled && !shortcutsPreferenceLoading && !isMobile;

	const renderSearchAction = () => {
		if (query) {
			return (
				<Button
					variant="ghost"
					size="icon-sm"
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => setQuery("")}
					aria-label={t("search.clear")}
				>
					<X />
				</Button>
			);
		}
		return showShortcutHints ? (
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onClick={openCommandPalette}
				className="hidden sm:flex"
				title={t("search.openPalette")}
			>
				<Kbd>⌘K</Kbd>
			</Button>
		) : null;
	};
	return (
		<HeaderSearch
			value={query}
			onChange={setQuery}
			label={t("search.mail")}
			mobileEnd={mobileEnd}
			placeholder={showShortcutHints ? t("search.mailHint") : t("search.mail")}
			inputProps={{ "data-mail-search-input": "" }}
			trailing={renderSearchAction()}
		/>
	);
}
