"use client";

import { useEffect } from "react";

import {
	AUTH_SESSION_CHANGED_EVENT,
	getClientSessionToken,
} from "@/lib/auth/client";
import {
	getPushState,
	registerMailflareServiceWorker,
} from "@/lib/push/client";

export function PwaServiceWorker() {
	useEffect(() => {
		if (!("serviceWorker" in navigator)) {
			return;
		}
		let running = false;
		let refreshAgain = false;
		let stopped = false;
		const refresh = async () => {
			if (stopped || document.visibilityState !== "visible") {
				return;
			}
			if (running) {
				refreshAgain = true;
				return;
			}
			running = true;
			try {
				await registerMailflareServiceWorker();
				if (getClientSessionToken()) {
					await getPushState();
				}
			} catch (error) {
				console.warn("Lab notification refresh failed", error);
			}
			running = false;
			if (refreshAgain) {
				refreshAgain = false;
				void refresh();
			}
		};
		void refresh();
		document.addEventListener("visibilitychange", refresh);
		window.addEventListener("online", refresh);
		window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
		return () => {
			stopped = true;
			document.removeEventListener("visibilitychange", refresh);
			window.removeEventListener("online", refresh);
			window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
		};
	}, []);
	return null;
}
