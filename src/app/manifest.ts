import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/app-identity";
import { THEME_COLORS } from "@/components/theme-utils";

/** Lab is used mostly as a home-screen web app: it opens on the launcher, full screen, in portrait. */
export default function manifest(): MetadataRoute.Manifest {
	return {
		id: "/",
		name: APP_NAME,
		short_name: APP_NAME,
		description: "Personal mail, calendar, and files.",
		start_url: "/",
		scope: "/",
		display: "standalone",
		orientation: "portrait",
		background_color: THEME_COLORS.light,
		theme_color: THEME_COLORS.light,
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			// The lab mark sits inside the maskable safe zone, so the same artwork can be cropped to a circle or squircle.
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
	};
}
