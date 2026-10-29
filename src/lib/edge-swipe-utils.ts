// A home-screen web app has no browser back gesture, so the app supplies its own from the left edge.
// In a browser tab the edge belongs to the browser, so the gesture only exists when installed.

export const EDGE_SWIPE_WIDTH = 24;

export function isStandaloneApp(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** True when a touch at `clientX` starts the app's edge gesture; other gestures should let it go. */
export function isEdgeSwipeStart(clientX: number): boolean {
	return clientX <= EDGE_SWIPE_WIDTH && isStandaloneApp();
}
