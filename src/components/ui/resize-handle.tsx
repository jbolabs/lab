"use client";

import { useRef } from "react";
import type { PointerEvent } from "react";

import type { ResizeHandleProps } from "./resize-handle-types";

export function ResizeHandle({
	label,
	onResizeStart,
	onResize,
	onResizeEnd,
}: ResizeHandleProps) {
	const startX = useRef<number | null>(null);

	function handlePointerDown(event: PointerEvent<HTMLHRElement>) {
		if (event.button !== 0) {
			return;
		}
		startX.current = event.clientX;
		event.currentTarget.setPointerCapture(event.pointerId);
		onResizeStart?.();
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent<HTMLHRElement>) {
		if (startX.current === null) {
			return;
		}
		onResize(event.clientX - startX.current);
	}

	function handlePointerEnd() {
		if (startX.current === null) {
			return;
		}
		startX.current = null;
		onResizeEnd?.();
	}

	return (
		<hr
			aria-label={label}
			aria-orientation="vertical"
			className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1/2 cursor-col-resize touch-none border-0"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerEnd}
			onPointerCancel={handlePointerEnd}
		/>
	);
}
