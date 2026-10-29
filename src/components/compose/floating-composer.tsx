"use client";

import { MailPlus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useCompose } from "@/components/compose/compose-context";
import { ComposeForm } from "@/components/compose/compose-form";
import { useLanguage } from "@/components/language-provider";
import { useSidebar } from "@/components/sidebar-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { isMessageReaderPath } from "./utils";

// Gmail's extended button: it folds to its icon while you scroll down a list and opens back out
// when you scroll up. Listens in the capture phase because every list scrolls its own container.
function useCondensedOnScroll(enabled: boolean) {
	const [condensed, setCondensed] = useState(false);
	useEffect(() => {
		if (!enabled) {
			return;
		}
		// Measured from where the scroll last turned, not event to event: iOS reports smooth scrolling as
		// many 2-3px steps, which no per-event threshold would ever see.
		const anchors = new WeakMap<EventTarget, number>();
		function onScroll(event: Event) {
			const { target } = event;
			if (!(target instanceof HTMLElement)) {
				return;
			}
			const top = target.scrollTop;
			const anchor = anchors.get(target) ?? top;
			if (top <= 0) {
				anchors.set(target, 0);
				setCondensed(false);
			} else if (top - anchor > 12) {
				anchors.set(target, top);
				setCondensed(true);
			} else if (anchor - top > 12) {
				anchors.set(target, top);
				setCondensed(false);
			} else if (!anchors.has(target)) {
				anchors.set(target, top);
			}
		}
		document.addEventListener("scroll", onScroll, {
			capture: true,
			passive: true,
		});
		return () =>
			document.removeEventListener("scroll", onScroll, { capture: true });
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
		if (notice) {
			toast.success(notice.message, {
				action: notice.action
					? { label: notice.action.label, onClick: notice.action.onClick }
					: undefined,
				duration: notice.durationMs,
			});
		}
	}, [notice]);
	return (
		<>
			{/* Hidden while reading, and (via data-selection-active on a list header) while selecting, as in Gmail. */}
			{showButton && !open && !mobileOpen && !isMessageReaderPath(pathname) && (
				<Button
					type="button"
					variant="floating"
					size="fab"
					shape="pill"
					onClick={openComposer}
					aria-label={t("navigation.compose")}
					className="fixed right-safe bottom-safe z-30 overflow-hidden active:scale-95 md:hidden [:root:has([data-selection-active])_&]:hidden"
				>
					<MailPlus data-icon="inline-start" />
					<span
						className={cn(
							"grid transition-all duration-200",
							condensed
								? "grid-cols-[0fr] opacity-0"
								: "grid-cols-[1fr] opacity-100"
						)}
					>
						<span className="overflow-hidden pl-2 whitespace-nowrap">
							{t("navigation.compose")}
						</span>
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
						if (/^\/drafts\/[^/]+\/?$/u.test(pathname)) {
							router.replace("/drafts");
						}
					}}
				/>
			)}
		</>
	);
}
