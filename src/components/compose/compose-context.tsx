"use client";

import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	useMemo,
	useCallback,
} from "react";
import type { ReactNode } from "react";

interface ComposeContextValue {
	open: boolean;
	draftId: string | null;
	openComposer: () => void;
	openDraftComposer: (draftId: string) => void;
	closeComposer: () => void;
	notice: ComposeNotice | null;
	/** Shows a toast; `action` adds a button, `durationMs` overrides the default 3.2s. */
	showNotice: (
		message: string | null,
		options?: {
			action?: { label: string; onClick: () => void };
			durationMs?: number;
		}
	) => void;
}

export interface ComposeNotice {
	message: string;
	action?: { label: string; onClick: () => void };
	durationMs: number;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

export function useCompose() {
	const ctx = useContext(ComposeContext);
	if (!ctx) {
		throw new Error("useCompose must be used within ComposeProvider");
	}
	return ctx;
}

export function ComposeProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [draftId, setDraftId] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);

	const rememberOpener = useCallback(() => {
		opener.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
	}, []);
	const [notice, setNotice] = useState<ComposeNotice | null>(null);

	useEffect(() => {
		if (!notice) {
			return;
		}
		const timer = setTimeout(() => setNotice(null), notice.durationMs);
		return () => clearTimeout(timer);
	}, [notice]);

	const contextValue = useMemo<ComposeContextValue>(
		() => ({
			closeComposer: () => {
				setOpen(false);
				setDraftId(null);
				const previous = opener.current;
				opener.current = null;
				if (previous) {
					requestAnimationFrame(() => {
						if (previous.isConnected) {
							previous.focus();
						}
					});
				}
			},
			draftId,
			notice,
			open,
			openComposer: () => {
				rememberOpener();
				setDraftId(null);
				setOpen(true);
			},
			openDraftComposer: (nextDraftId) => {
				if (!open) {
					rememberOpener();
				}
				setDraftId(nextDraftId);
				setOpen(true);
			},
			showNotice: (message, options) =>
				setNotice(
					message
						? {
								action: options?.action,
								durationMs: options?.durationMs ?? 3200,
								message,
							}
						: null
				),
		}),
		[draftId, notice, open, rememberOpener]
	);
	return (
		<ComposeContext.Provider value={contextValue}>
			{children}
		</ComposeContext.Provider>
	);
}
