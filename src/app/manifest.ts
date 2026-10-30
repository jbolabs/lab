import { THEME_COLORS } from "@/components/theme-utils";
import { APP_NAME } from "@/lib/app-identity";

/** Lab is used mostly as a home-screen web app: it opens on the launcher, full screen, in portrait. */
export default function manifest() {
	return {
		background_color: THEME_COLORS.light,
		description: "Personal mail, calendar, and files.",
		display: "standalone",
		icons: [
			{
				purpose: "any",
				sizes: "192x192",
				src: "/icon-192.png",
				type: "image/png",
			},
			{
				purpose: "any",
				sizes: "512x512",
				src: "/icon-512.png",
				type: "image/png",
			},
			// The jbo mark sits inside the maskable safe zone, so the same artwork can be cropped to a circle or squircle.
			{
				purpose: "maskable",
				sizes: "512x512",
				src: "/icon-512.png",
				type: "image/png",
			},
		],
		id: "/",
		name: APP_NAME,
		orientation: "portrait",
		scope: "/",
		short_name: APP_NAME,
		start_url: "/",
		theme_color: THEME_COLORS.light,
	};
}
