"use client";

import packageJson from "../../package.json";
import { useSidebar } from "./sidebar-state";
import { useShortcuts } from "./shortcuts";
import { Keyboard } from "lucide-react";
import { useLanguage } from "./language-provider";

export function SidebarFooter() {
	const { t } = useLanguage();
	const { minimal } = useSidebar();
	const { openHelpModal, shortcutsEnabled, shortcutsPreferenceLoading } = useShortcuts();
	if (minimal) return null;

  return (
    <div className="px-3 pt-3 flex flex-col gap-2">
      {shortcutsEnabled && !shortcutsPreferenceLoading && (
        <button
          type="button"
          onClick={openHelpModal}
          className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-muted-foreground/70" />
            {t("navigation.shortcuts")}
          </span>
          <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-card border border-border rounded text-muted-foreground shadow-2xs">
            ?
          </kbd>
        </button>
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
