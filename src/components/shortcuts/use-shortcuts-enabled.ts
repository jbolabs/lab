"use client";

import { useCallback, useEffect, useState } from "react";

import {
	loadShortcutsEnabled,
	updateShortcutsEnabled,
} from "./use-shortcuts-enabled-utils";

/** Loads and updates the signed-in account's keyboard shortcut preference. */
export function useShortcutsEnabled() {
	const [localEnabled, setLocalEnabled] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void loadShortcutsEnabled()
			.then((storedEnabled) => {
				if (!cancelled) {
					setLocalEnabled(storedEnabled);
				}

				return null;
			})
			.catch((loadError) => {
				if (cancelled) {
					return;
				}
				setLocalEnabled(true);
				setError(
					loadError instanceof Error
						? loadError.message
						: "Failed to load shortcut settings"
				);
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const setEnabled = useCallback(
		async (next: boolean) => {
			const previous = localEnabled;
			setLocalEnabled(next);
			setError(null);
			try {
				setLocalEnabled(await updateShortcutsEnabled(next));
			} catch (updateError) {
				setLocalEnabled(previous);
				const message =
					updateError instanceof Error
						? updateError.message
						: "Failed to update shortcut settings";
				setError(message);
				throw new Error(message, { cause: updateError });
			}
		},
		[localEnabled]
	);

	return { enabled: localEnabled, error, isLoading, setEnabled };
}
