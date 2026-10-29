"use client";

import { ChevronLeft, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { isEdgeSwipeStart } from "@/lib/edge-swipe-utils";
import { cn } from "@/lib/utils";

const TRIGGER_DISTANCE = 72;
const MAX_PULL = 96;

// Swiping in from the left edge goes back when the screen has a back button (marked
// `data-edge-swipe-back`, so the gesture follows exactly where that button goes) and otherwise
// opens the navigation drawer, as Gmail does on its lists.
function findBackButton() {
	const candidates = document.querySelectorAll<HTMLElement>("[data-edge-swipe-back]");
	return Array.from(candidates).find((element) => element.offsetParent !== null) ?? null;
}

function blockedByOverlay() {
	return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], .compose-sheet');
}

export function EdgeSwipe({ onOpenMenu, disabled }: { onOpenMenu: () => void; disabled?: boolean }) {
	const [drag, setDrag] = useState<{ x: number; y: number; back: boolean } | null>(null);
	const openMenu = useRef(onOpenMenu);
	openMenu.current = onOpenMenu;

	useEffect(() => {
		if (disabled) return;
		let start: { x: number; y: number; back: boolean } | null = null;
		let tracking = false;
		let armed = false;
		let distance = 0;

		function reset() {
			start = null;
			tracking = false;
			armed = false;
			distance = 0;
			setDrag(null);
		}
		function onTouchStart(event: TouchEvent) {
			const touch = event.touches[0];
			if (event.touches.length !== 1 || !isEdgeSwipeStart(touch.clientX) || blockedByOverlay()) return;
			start = { x: touch.clientX, y: touch.clientY, back: !!findBackButton() };
		}
		function onTouchMove(event: TouchEvent) {
			if (!start) return;
			const touch = event.touches[0];
			const dx = touch.clientX - start.x;
			const dy = touch.clientY - start.y;
			if (!tracking) {
				if (Math.abs(dy) > 12 && Math.abs(dy) > dx) return reset();
				if (dx < 8) return;
				tracking = true;
			}
			distance = Math.max(0, Math.min(MAX_PULL, dx * 0.6));
			const nowArmed = distance >= TRIGGER_DISTANCE * 0.6;
			if (nowArmed !== armed) {
				armed = nowArmed;
				haptic("selection");
			}
			setDrag({ x: distance, y: touch.clientY, back: start.back });
		}
		function onTouchEnd() {
			if (start && tracking && armed) {
				haptic("impact");
				if (start.back) findBackButton()?.click();
				else openMenu.current();
			}
			reset();
		}

		document.addEventListener("touchstart", onTouchStart, { passive: true });
		document.addEventListener("touchmove", onTouchMove, { passive: true });
		document.addEventListener("touchend", onTouchEnd, { passive: true });
		document.addEventListener("touchcancel", reset, { passive: true });
		return () => {
			document.removeEventListener("touchstart", onTouchStart);
			document.removeEventListener("touchmove", onTouchMove);
			document.removeEventListener("touchend", onTouchEnd);
			document.removeEventListener("touchcancel", reset);
		};
	}, [disabled]);

	if (!drag) return null;
	const progress = Math.min(1, drag.x / (TRIGGER_DISTANCE * 0.6));
	const Icon = drag.back ? ChevronLeft : Menu;
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed left-0 z-[60] flex -translate-y-1/2 items-center justify-center rounded-r-full bg-foreground/85 text-background shadow-lg"
			style={{ top: drag.y, height: 56, width: 12 + drag.x * 0.45, opacity: 0.35 + progress * 0.65 }}
		>
			<Icon className={cn("size-5 shrink-0 transition-transform duration-150", progress >= 1 ? "scale-110" : "scale-75")} />
		</div>
	);
}
