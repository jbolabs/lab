"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { useLanguage } from "@/components/language-provider";
import { cn as clsx } from "@/lib/utils";

export type DriveColumn = "owner" | "updatedAt" | "size";

const STORAGE_KEY = "mailflare-drive-columns";
const DEFAULT_WIDTHS: Record<DriveColumn, number> = {
	owner: 100,
	size: 96,
	updatedAt: 144,
};
const MIN_WIDTH = 72;
const MAX_WIDTH = 480;
const clamp = (value: number) =>
	Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));

function subscribeWidths(onChange: () => void) {
	window.addEventListener("storage", onChange);
	return () => window.removeEventListener("storage", onChange);
}
function readWidths() {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}
function parseWidths(raw: string | null) {
	try {
		const saved = JSON.parse(raw ?? "null");
		return {
			owner: clamp(saved?.owner ?? DEFAULT_WIDTHS.owner),
			size: clamp(saved?.size ?? DEFAULT_WIDTHS.size),
			updatedAt: clamp(saved?.updatedAt ?? DEFAULT_WIDTHS.updatedAt),
		};
	} catch {
		return DEFAULT_WIDTHS;
	}
}

/** Widths of the resizable columns; the name column takes whatever is left. Remembered per browser. */
export function useDriveColumns() {
	const [widths, setWidths] = useState(DEFAULT_WIDTHS);

	const savedWidths = useSyncExternalStore(
		subscribeWidths,
		readWidths,
		() => null
	);
	const [previousSavedWidths, setPreviousSavedWidths] = useState<string | null>(
		null
	);
	if (savedWidths !== previousSavedWidths) {
		setPreviousSavedWidths(savedWidths);
		setWidths(parseWidths(savedWidths));
	}

	const resize = useCallback(
		(column: DriveColumn, width: number, persist = false) => {
			setWidths((current) => {
				const next = { ...current, [column]: clamp(width) };
				if (persist) {
					try {
						localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
					} catch {
						/* ignore */
					}
				}
				return next;
			});
		},
		[]
	);

	const template = `2rem minmax(0,1fr) ${widths.owner}px ${widths.updatedAt}px ${widths.size}px 2.5rem`;
	return { resize, template, widths };
}

/**
 * Drag handle on the left edge of a column header: dragging left makes the column wider. The drag is tracked on
 * `window` from the width it started with, so it ends cleanly wherever the pointer is released and never leaves a
 * listener behind on the handle.
 */
export function ColumnResizeHandle({
	column,
	width,
	onResize,
	label,
}: {
	column: DriveColumn;
	width: number;
	onResize: (column: DriveColumn, width: number, persist?: boolean) => void;
	label: string;
}) {
	const { t } = useLanguage();
	const [dragging, setDragging] = useState(false);
	const cleanup = useRef<(() => void) | null>(null);
	useEffect(() => () => cleanup.current?.(), []);

	function onPointerDown(event: PointerEvent<HTMLHRElement>) {
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		cleanup.current?.();
		const startX = event.clientX;
		const startWidth = width;
		let latest = startWidth;
		const move = (moveEvent: globalThis.PointerEvent) => {
			latest = startWidth + (startX - moveEvent.clientX);
			onResize(column, latest);
		};

		function end(endEvent?: Event) {
			if (endEvent && endEvent.type === "pointerup") {
				latest =
					startWidth + (startX - (endEvent as globalThis.PointerEvent).clientX);
			}
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
			window.removeEventListener("blur", end);
			document.body.style.removeProperty("cursor");
			document.body.style.removeProperty("user-select");
			cleanup.current = null;
			setDragging(false);
			onResize(column, latest, true);
		}
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", end);
		window.addEventListener("blur", end);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		cleanup.current = end;
		setDragging(true);
	}
	function onKeyDown(event: KeyboardEvent<HTMLHRElement>) {
		const step = event.shiftKey ? 40 : 10;
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			onResize(column, width + step, true);
		}
		if (event.key === "ArrowRight") {
			event.preventDefault();
			onResize(column, width - step, true);
		}
	}
	return (
		<div
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Adjustable separator exposes range values and keyboard input; hr is static.
			role="separator"
			aria-orientation="vertical"
			aria-label={t("drive.resizeColumn", { name: label })}
			aria-valuenow={width}
			aria-valuemin={MIN_WIDTH}
			aria-valuemax={MAX_WIDTH}
			tabIndex={0}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			className={clsx(
				"absolute top-0 -left-2 h-full w-1 cursor-col-resize touch-none border-0 outline-none hover:bg-primary focus-visible:bg-primary",
				dragging ? "bg-primary" : "bg-transparent"
			)}
		/>
	);
}
