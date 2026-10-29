import screens from "./startup-screens.json";

export const LAUNCH_BACKGROUND = screens.background;
export const LAUNCH_MARK_SIZE = screens.markSize;

/** `apple-touch-startup-image` entries for every screen in startup-screens.json (portrait only; the app is portrait). */
export function getStartupImages() {
	return screens.screens.map(({ width, height, ratio }) => ({
		url: `/startup/${width * ratio}x${height * ratio}.png`,
		media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
	}));
}

export const LAUNCH_SPLASH_SEEN_KEY = "lab-launch-splash-seen";

// Runs in <head> before paint: after the first launch in this session, later full page loads (a login
// redirect, an offline fallback) skip the splash instead of flashing it.
export const launchSeenScript = `try{if(sessionStorage.getItem("${LAUNCH_SPLASH_SEEN_KEY}"))document.documentElement.dataset.launched=""}catch{}`;
