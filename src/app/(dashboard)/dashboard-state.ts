"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { useClientReady } from "@/components/use-client-ready";
import { subscribeToStorage } from "@/hooks/storage-subscription";
import { fetchCurrentUser } from "@/hooks/use-current-user";

import {
	readInitialAssistantPanelState,
	saveAssistantPanelState,
} from "./dashboard-state-utils";

export function useDashboardState() {
	const savedOpen = useSyncExternalStore(
		subscribeToStorage,
		() => readInitialAssistantPanelState().open,
		() => false
	);
	const [localOpen, setLocalOpen] = useState<boolean | null>(null);
	const assistantOpen = localOpen ?? savedOpen;
	const savedFullSize = useSyncExternalStore(
		subscribeToStorage,
		() => readInitialAssistantPanelState().fullSize,
		() => false
	);
	const [localFullSize, setLocalFullSize] = useState<boolean | null>(null);
	const assistantFullSize = localFullSize ?? savedFullSize;
	const panelRestored = useClientReady();
	const [storagePrefix, setStoragePrefix] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void fetchCurrentUser()
			.then((user) => {
				if (cancelled || !user?.id) {
					return null;
				}
				const prefix = `mailflare-dashboard:${user.id}`;
				try {
					const accountOpen = localStorage.getItem(`${prefix}:assistant-open`);
					const accountFullSize = localStorage.getItem(
						`${prefix}:assistant-full-size`
					);
					const initial = readInitialAssistantPanelState();
					setLocalOpen(
						accountOpen === null ? initial.open : accountOpen === "true"
					);
					setLocalFullSize(
						accountFullSize === null
							? initial.fullSize
							: accountFullSize === "true"
					);
				} catch {
					/* Storage is optional. */
				}
				setStoragePrefix(prefix);

				return null;
			})
			.catch(() => {
				// Keep the current UI state when this optional background request fails.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!panelRestored) {
			return;
		}
		saveAssistantPanelState(assistantOpen, assistantFullSize, storagePrefix);
	}, [panelRestored, storagePrefix, assistantOpen, assistantFullSize]);

	return {
		assistantFullSize,
		assistantOpen,
		setAssistantFullSize: setLocalFullSize,
		setAssistantOpen: setLocalOpen,
	};
}
