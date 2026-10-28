import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/app-identity";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: APP_NAME,
		short_name: APP_NAME,
		description: "Personal mail, calendar, and files.",
		start_url: "/inbox",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#ffffff",
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
		],
	};
}
