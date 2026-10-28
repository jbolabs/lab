"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { HeaderSearch } from "@/components/header-search";
import { useMailSearch } from "./mail-search-context";
import { useShortcuts } from "@/components/shortcuts";

export function MailSearchInput({ mobileEnd }: { mobileEnd?: boolean }) {
	const { t } = useLanguage();
	const { input: query, setQuery } = useMailSearch();
	const { openCommandPalette, shortcutsEnabled, shortcutsPreferenceLoading } =
		useShortcuts();
	const showShortcutHints = shortcutsEnabled && !shortcutsPreferenceLoading;

	return (
		<HeaderSearch
			value={query}
			onChange={setQuery}
			label={t("search.mail")}
			mobileEnd={mobileEnd}
			placeholder={showShortcutHints ? t("search.mailHint") : t("search.mail")}
			inputProps={{ "data-mail-search-input": "" }}
			trailing={
				query ? (
					<Button
						variant="ghost"
						size="icon"
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => setQuery("")}
						className="size-8 max-md:size-11"
						aria-label={t("search.clear")}
					>
						<X />
					</Button>
				) : showShortcutHints ? (
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
				) : null
			}
		/>
	);
}
