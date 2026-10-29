"use client";

import { useEffect, useRef, useState } from "react";

import { LAUNCH_SPLASH_SEEN_KEY } from "@/lib/launch/startup-screens-utils";

// The launch splash continues the static iOS startup image (public/startup, same ink and mark at the
// same size), so the hand-off is invisible; once the app has started, the mark dips and zooms through
// the screen while the ink fades, revealing the app. Shown only in the installed app (CSS
// `display-mode: standalone`) and once per launch (`launchSeenScript` marks later full loads). The exit
// runs on the Web Animations API, so it starts the moment the app is ready and ends on a promise.
const MIN_VISIBLE_MS = 450;

export function LaunchSplash() {
	const [gone, setGone] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const mark = useRef<HTMLImageElement>(null);

	useEffect(() => {
		try {
			sessionStorage.setItem(LAUNCH_SPLASH_SEEN_KEY, "1");
		} catch {
			// Private mode without storage: the splash simply plays again on the next full load.
		}
		const splash = root.current;
		if (!splash || getComputedStyle(splash).display === "none") {
			setGone(true);
			return;
		}
		let cancelled = false;
		const timer = window.setTimeout(
			() => {
				const reduce = window.matchMedia(
					"(prefers-reduced-motion: reduce)"
				).matches;
				mark.current?.animate(
					reduce
						? [{ opacity: 1 }, { opacity: 0 }]
						: [
								{
									easing: "cubic-bezier(0.33, 1, 0.68, 1)",
									transform: "scale(1)",
								},
								{
									easing: "cubic-bezier(0.32, 0, 0.67, 0)",
									offset: 0.21,
									opacity: 1,
									transform: "scale(0.9)",
								},
								{ opacity: 0, transform: "scale(6)" },
							],
					{ duration: reduce ? 200 : 560, fill: "forwards" }
				);
				const fade = splash.animate([{ opacity: 1 }, { opacity: 0 }], {
					delay: reduce ? 0 : 360,
					duration: reduce ? 200 : 240,
					easing: "cubic-bezier(0.2, 0, 0, 1)",
					fill: "forwards",
				});
				void fade.finished.then(
					() => {
						if (!cancelled) {
							setGone(true);
						}

						return null;
					},
					() => {
						// No provider or recoverable background failure requires an action.
					}
				);
			},
			Math.max(0, MIN_VISIBLE_MS - performance.now())
		);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	if (gone) {
		return null;
	}
	return (
		<div ref={root} className="launch-splash" aria-hidden="true">
			{/* oxlint-disable-next-line next/no-img-element -- Runtime branding uses the original image URL without an image optimization service. */}
			<img
				ref={mark}
				src="/icon-512.png"
				alt=""
				width={160}
				height={160}
				className="launch-splash-mark"
			/>
		</div>
	);
}
