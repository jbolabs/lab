"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
	return () => {
		// Readiness changes only at hydration; there is no external event source.
	};
}

function clientSnapshot() {
	return true;
}

function serverSnapshot() {
	return false;
}

export function useClientReady() {
	return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
