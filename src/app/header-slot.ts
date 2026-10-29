"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribeToHeader() {
	return () => {
		// Layout slots live for the lifetime of the mounted route shell.
	};
}

function serverHeaderSlot() {
	return null;
}

/** Read the shell's portal target after hydration without mirroring it in component state. */
export function useHeaderSlot(selector: string) {
	const snapshot = useCallback(
		() => document.querySelector<HTMLElement>(selector),
		[selector]
	);
	return useSyncExternalStore(subscribeToHeader, snapshot, serverHeaderSlot);
}
