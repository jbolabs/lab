"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";
import { haptic } from "@/lib/haptics";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

// Touch long-press, as Gmail uses to start selecting. Moving (a scroll or swipe) cancels it, and
// the click that follows a long press is swallowed so the row does not also open.
export function useLongPress(onLongPress: () => void, enabled = true) {
	const timer = useRef<number | null>(null);
	const start = useRef<{ x: number; y: number } | null>(null);
	const fired = useRef(false);

	function cancel() {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
		start.current = null;
	}

	return {
		onPointerDown(event: PointerEvent) {
			// Controls inside the row (avatar, star) keep their own press; only the row itself selects.
			if (!enabled || event.pointerType === "mouse" || (event.target as Element).closest("button")) return;
			fired.current = false;
			start.current = { x: event.clientX, y: event.clientY };
			timer.current = window.setTimeout(() => {
				timer.current = null;
				fired.current = true;
				haptic("impact");
				onLongPress();
			}, LONG_PRESS_MS);
		},
		onPointerMove(event: PointerEvent) {
			if (!start.current) return;
			if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > MOVE_TOLERANCE) cancel();
		},
		onPointerUp: cancel,
		onPointerCancel: cancel,
		onContextMenu(event: MouseEvent) {
			// Android opens the link menu on long press; the press is ours.
			if (fired.current || start.current) event.preventDefault();
		},
		onClickCapture(event: MouseEvent) {
			if (!fired.current) return;
			fired.current = false;
			event.preventDefault();
			event.stopPropagation();
		},
	};
}
