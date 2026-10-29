"use client";

import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";

import { isEdgeSwipeStart } from "@/lib/edge-swipe-utils";
import { haptic } from "@/lib/haptics";

interface SwipeAction {
	label: string;
	icon: LucideIcon;
	// Fill and text colour of the revealed action, e.g. "bg-primary text-primary-foreground".
	className: string;
	// Dismissing actions fly the row off and collapse it, as archiving does in Gmail;
	// `restore` brings it back (on failure or undo).
	dismisses?: boolean;
	onTrigger: (restore: () => void) => void;
}

interface SwipeableRowProps {
	children: ReactNode;
	// Revealed when dragging left to right.
	startAction: SwipeAction;
	// Revealed when dragging right to left.
	endAction: SwipeAction;
	disabled?: boolean;
	role?: string;
}

const COMMIT_DISTANCE = 88;
const INTENT_DISTANCE = 10;
// A quick flick commits before the finger reaches COMMIT_DISTANCE.
// px per ms
const FLICK_VELOCITY = 0.6;
const FLICK_MIN_DISTANCE = 40;
const FLY_MS = 180;
const COLLAPSE_MS = 200;

type Phase = "idle" | "dragging" | "flying" | "collapsing" | "collapsed";

// Touch-only swipe gestures; vertical scrolling stays with the browser via touch-action: pan-y.
export function SwipeableRow({
	children,
	startAction,
	endAction,
	disabled,
	role,
}: SwipeableRowProps) {
	const [offset, setOffset] = useState(0);
	const [phase, setPhase] = useState<Phase>("idle");
	const [height, setHeight] = useState<number | null>(null);
	const container = useRef<HTMLDivElement>(null);
	const gesture = useRef<{
		x: number;
		y: number;
		active: boolean;
		id: number;
		lastX: number;
		lastT: number;
		velocity: number;
	} | null>(null);
	const swiped = useRef(false);
	const wasArmed = useRef(false);

	function restore() {
		setHeight(null);
		setOffset(0);
		setPhase("idle");
	}

	function dismiss(action: SwipeAction, direction: 1 | -1) {
		const element = container.current;
		const width = element?.offsetWidth ?? window.innerWidth;
		setPhase("flying");
		setOffset(direction * width);
		window.setTimeout(() => {
			setHeight(element?.offsetHeight ?? 0);
			setPhase("collapsing");
			// Commit the measured height first so the next frame can transition it to zero.
			requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)));
			window.setTimeout(() => {
				setPhase("collapsed");
				action.onTrigger(restore);
			}, COLLAPSE_MS);
		}, FLY_MS);
	}

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if (
			disabled ||
			phase !== "idle" ||
			event.pointerType === "mouse" ||
			isEdgeSwipeStart(event.clientX)
		) {
			return;
		}
		gesture.current = {
			active: false,
			id: event.pointerId,
			lastT: event.timeStamp,
			lastX: event.clientX,
			velocity: 0,
			x: event.clientX,
			y: event.clientY,
		};
		swiped.current = false;
		wasArmed.current = false;
	}

	function onPointerMove(event: PointerEvent<HTMLDivElement>) {
		const { current } = gesture;
		if (!current || current.id !== event.pointerId) {
			return;
		}
		const dx = event.clientX - current.x;
		const dy = event.clientY - current.y;
		if (!current.active) {
			if (Math.abs(dy) > INTENT_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
				gesture.current = null;
				return;
			}
			if (Math.abs(dx) < INTENT_DISTANCE) {
				return;
			}
			current.active = true;
			setPhase("dragging");
			event.currentTarget.setPointerCapture(event.pointerId);
		}
		const elapsed = event.timeStamp - current.lastT;
		if (elapsed > 0) {
			current.velocity = (event.clientX - current.lastX) / elapsed;
		}
		current.lastX = event.clientX;
		current.lastT = event.timeStamp;
		const armed = Math.abs(dx) >= COMMIT_DISTANCE;
		// Tick as the action arms and disarms, like a native swipe crossing its threshold.
		if (armed !== wasArmed.current) {
			wasArmed.current = armed;
			haptic("selection");
		}
		setOffset(dx);
	}

	function finish(event: PointerEvent<HTMLDivElement>) {
		const { current } = gesture;
		if (!current || current.id !== event.pointerId) {
			return;
		}
		gesture.current = null;
		if (!current.active) {
			return;
		}
		swiped.current = true;
		const dx = event.clientX - current.x;
		const flicked =
			Math.abs(dx) >= FLICK_MIN_DISTANCE &&
			Math.abs(current.velocity) >= FLICK_VELOCITY &&
			Math.sign(current.velocity) === Math.sign(dx);
		const commit =
			event.type !== "pointercancel" &&
			(Math.abs(dx) >= COMMIT_DISTANCE || flicked);
		const action = dx > 0 ? startAction : endAction;
		if (commit) {
			haptic("impact");
		}
		if (commit && action.dismisses) {
			dismiss(action, dx > 0 ? 1 : -1);
			return;
		}
		setPhase("idle");
		setOffset(0);
		if (commit) {
			action.onTrigger(restore);
		}
	}

	const getRevealedAction = () => {
		if (offset > 0) {
			return startAction;
		}
		return offset < 0 ? endAction : null;
	};
	const action = getRevealedAction();
	const Icon = action?.icon;
	const armed = Math.abs(offset) >= COMMIT_DISTANCE || phase === "flying";

	return (
		<div
			ref={container}
			role={role}
			className="relative h-(--mf-height) overflow-hidden transition-all duration-200 ease-(--collapse-ease)"
			style={
				(height === null
					? undefined
					: {
							"--collapse-ease": "cubic-bezier(0.2, 0.8, 0.2, 1)",
							"--mf-height": `${height}px`,
						}) as CSSProperties &
					Record<`--${string}`, string | number | undefined>
			}
			hidden={phase === "collapsed"}
		>
			{action && Icon && (
				<div
					aria-hidden="true"
					className={clsx(
						"absolute inset-0 flex items-center px-6",
						offset > 0 ? "justify-start" : "justify-end",
						action.className
					)}
				>
					<span
						className={clsx(
							"flex items-center gap-2 text-sm font-medium transition-transform duration-150 ease-out",
							armed ? "scale-110" : "scale-90 opacity-80"
						)}
					>
						<Icon className="size-5" />
						{action.label}
					</span>
				</div>
			)}
			<div
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={finish}
				onPointerCancel={finish}
				onClickCapture={(event) => {
					if (!swiped.current) {
						return;
					}
					swiped.current = false;
					event.preventDefault();
					event.stopPropagation();
				}}
				className={`[transform:var(--mf-transform)] ${clsx(
					"relative touch-pan-y bg-card",
					phase !== "dragging" &&
						"transition-transform ease-out motion-reduce:transition-none",
					phase === "flying" ? "duration-(--fly-duration)" : "duration-200"
				)}`}
				style={
					{
						"--fly-duration": `${FLY_MS}ms`,
						"--mf-transform": offset ? `translateX(${offset}px)` : undefined,
					} as CSSProperties &
						Record<`--${string}`, string | number | undefined>
				}
			>
				{children}
			</div>
		</div>
	);
}
