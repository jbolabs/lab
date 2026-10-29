"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { RouteLoadingBar } from "./route-loading-bar";

function subscribeMount() {
	return () => {
		// Mount state has no subsequent external updates.
	};
}
function clientSnapshot() {
	return true;
}
function serverSnapshot() {
	return false;
}

// Pinned to the viewport top even when an ancestor's transform (e.g. a page transition) would otherwise become the fixed containing block.
export function RouteLoadingBarPortal() {
	const mounted = useSyncExternalStore(
		subscribeMount,
		clientSnapshot,
		serverSnapshot
	);
	if (!mounted) {
		return <RouteLoadingBar />;
	}
	return createPortal(<RouteLoadingBar />, document.body);
}
