"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useLanguage } from "@/components/language-provider";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { PullToRefreshProps } from "./pull-to-refresh-types";

// Measured on the finger, not the damped indicator, so a normal thumb pull is enough.
const TRIGGER_PULL = 100;
const MAX_PULL = 110;
const REFRESHING_OFFSET = 52;
const MIN_SPIN_MS = 500;

// The root has overscroll-behavior: none, which removes the browser's own pull-to-refresh, so lists
// that want it bring this back. Touch only; listeners are passive, so scrolling never waits on them.
function usePullToRefresh(scroller: RefObject<HTMLElement | null>, onRefresh: () => Promise<unknown>) {
	const [pull, setPull] = useState(0);
	const [progress, setProgress] = useState(0);
	const [refreshing, setRefreshing] = useState(false);
	const refreshRef = useRef(onRefresh);
	refreshRef.current = onRefresh;

	useEffect(() => {
		const element = scroller.current;
		if (!element) return;
		let startY: number | null = null;
		let raw = 0;
		let busy = false;

		function onTouchStart(event: TouchEvent) {
			startY = !busy && element!.scrollTop <= 0 && event.touches.length === 1 ? event.touches[0].clientY : null;
			raw = 0;
		}
		function onTouchMove(event: TouchEvent) {
			if (startY === null) return;
			const dy = event.touches[0].clientY - startY;
			if (dy <= 0 || element!.scrollTop > 0) {
				startY = null;
				raw = 0;
				setPull(0);
				setProgress(0);
				return;
			}
			raw = dy;
			// Rubber-band: the indicator follows the finger less and less the further it goes.
			setPull(MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6))));
			setProgress(Math.min(1, dy / TRIGGER_PULL));
		}
		function onTouchEnd() {
			if (startY === null) return;
			startY = null;
			setProgress(0);
			if (raw < TRIGGER_PULL) {
				setPull(0);
				return;
			}
			haptic("selection");
			busy = true;
			setRefreshing(true);
			setPull(REFRESHING_OFFSET);
			const minimum = new Promise((resolve) => window.setTimeout(resolve, MIN_SPIN_MS));
			void Promise.allSettled([refreshRef.current(), minimum]).then(() => {
				busy = false;
				setRefreshing(false);
				setPull(0);
			});
		}

		element.addEventListener("touchstart", onTouchStart, { passive: true });
		element.addEventListener("touchmove", onTouchMove, { passive: true });
		element.addEventListener("touchend", onTouchEnd, { passive: true });
		element.addEventListener("touchcancel", onTouchEnd, { passive: true });
		return () => {
			element.removeEventListener("touchstart", onTouchStart);
			element.removeEventListener("touchmove", onTouchMove);
			element.removeEventListener("touchend", onTouchEnd);
			element.removeEventListener("touchcancel", onTouchEnd);
		};
	}, [scroller]);

	return { pull, progress, refreshing };
}

export function PullToRefresh({ scroller, onRefresh, children }: PullToRefreshProps) {
	const { t } = useLanguage();
	const { pull, progress, refreshing } = usePullToRefresh(scroller, onRefresh);
	const tracking = pull > 0 && !refreshing;

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				aria-hidden={!refreshing}
				role={refreshing ? "status" : undefined}
				className={cn(
					"pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center",
					!tracking && "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
				)}
				style={{ transform: `translateY(${pull - 40}px)`, opacity: pull > 0 || refreshing ? 1 : 0 }}
			>
				<span className="flex size-9 items-center justify-center rounded-full border border-border bg-popover text-signal shadow-sm">
					<RefreshCw
						className={cn("size-4", refreshing && "animate-spin")}
						style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
					/>
					{refreshing && <span className="sr-only">{t("common.loading")}</span>}
				</span>
			</div>
			{children}
		</div>
	);
}
