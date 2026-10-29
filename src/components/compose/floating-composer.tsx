"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MailPlus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ComposeForm } from "@/components/compose/compose-form";
import { useCompose } from "@/components/compose/compose-context";
import { useSidebar } from "@/components/sidebar-state";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import { isMessageReaderPath } from "./utils";

// Gmail's extended button: it folds to its icon while you scroll down a list and opens back out
// when you scroll up. Listens in the capture phase because every list scrolls its own container.
function useCondensedOnScroll(enabled: boolean) {
	const [condensed, setCondensed] = useState(false);
	useEffect(() => {
		if (!enabled) return;
		const last = new WeakMap<EventTarget, number>();
		function onScroll(event: Event) {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const top = target.scrollTop;
			const previous = last.get(target) ?? top;
			last.set(target, top);
			if (top <= 0) setCondensed(false);
			else if (top - previous > 4) setCondensed(true);
			else if (previous - top > 4) setCondensed(false);
		}
		document.addEventListener("scroll", onScroll, { capture: true, passive: true });
		return () => document.removeEventListener("scroll", onScroll, { capture: true });
	}, [enabled]);
	return condensed;
}

/** `showButton` adds the phone Compose button; only the dashboard pages (mail) pass it. */
export function FloatingComposer({
	showButton = false,
}: {
	showButton?: boolean;
}) {
	const { open, draftId, openComposer, closeComposer, notice } = useCompose();
	const pathname = usePathname();
	const router = useRouter();
	const { t } = useLanguage();
	const { mobileOpen } = useSidebar();
	const condensed = useCondensedOnScroll(showButton);
	useEffect(() => {
		if (notice)
			toast.success(notice.message, {
				duration: notice.durationMs,
				action: notice.action
					? { label: notice.action.label, onClick: notice.action.onClick }
					: undefined,
			});
	}, [notice]);
	return (
		<>
			{/* Hidden while reading, and (via data-selection-active on a list header) while selecting, as in Gmail. */}
			{showButton && !open && !mobileOpen && !isMessageReaderPath(pathname) && (
				<Button
					type="button"
					onClick={openComposer}
					aria-label={t("navigation.compose")}
					className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 min-h-14 gap-0 overflow-hidden rounded-2xl px-4 shadow-lg transition-transform duration-100 ease-out active:scale-95 md:hidden motion-reduce:transition-none [:root:has([data-selection-active])_&]:hidden"
				>
					<MailPlus data-icon="inline-start" className="size-5" />
					<span
						className={cn(
							"grid transition-[grid-template-columns,opacity] duration-200 ease-out motion-reduce:transition-none",
							condensed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100",
						)}
					>
						<span className="overflow-hidden whitespace-nowrap pl-2">{t("navigation.compose")}</span>
					</span>
				</Button>
			)}
			{open && (
				<ComposeForm
					key={draftId ?? "new"}
					mode="popup"
					draftIdToLoad={draftId}
					onClose={() => {
						closeComposer();
						if (/^\/drafts\/[^/]+\/?$/.test(pathname))
							router.replace("/drafts");
					}}
				/>
			)}
		</>
	);
}
