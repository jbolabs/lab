import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";

import { AppDocument } from "@/components/app-document";
import { THEME_COLORS } from "@/components/theme-utils";
import { PageTitle } from "@/components/ui/page-header";
import { getStartupImages } from "@/lib/launch/startup-screens-utils";
import { bootstrap } from "@/lib/route-data";

export const Route = createRootRoute({
	// oxlint-disable-next-line no-use-before-define -- The document reads this route's loader data.
	component: Root,
	head: ({ loaderData }) => ({
		links: [
			{ href: "/api/branding/icon", rel: "icon" },
			{ href: "/apple-touch-icon.png", rel: "apple-touch-icon" },
			{ href: "/manifest.webmanifest", rel: "manifest" },
			...getStartupImages().map((image) => ({
				href: image.url,
				media: image.media,
				rel: "apple-touch-startup-image",
			})),
		],
		meta: [
			{ charSet: "utf-8" },
			{
				content:
					"width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
				name: "viewport",
			},
			{ title: loaderData?.branding.appName ?? "The Lab" },
			{ content: "Personal mail, calendar, and files", name: "description" },
			{
				content: "noindex, nofollow, noarchive, nosnippet, noimageindex",
				name: "robots",
			},
			{ content: "yes", name: "apple-mobile-web-app-capable" },
			{
				content: loaderData?.branding.appName ?? "The Lab",
				name: "apple-mobile-web-app-title",
			},
			{ content: "default", name: "apple-mobile-web-app-status-bar-style" },
			...Object.entries(THEME_COLORS).map(([mode, color]) => ({
				content: color,
				media: `(prefers-color-scheme: ${mode})`,
				name: "theme-color",
			})),
		],
	}),
	loader: () => bootstrap(),
	notFoundComponent: () => (
		<main>
			<PageTitle>Page not found</PageTitle>
			<a href="/">Go home</a>
		</main>
	),
});
function Root() {
	return (
		<AppDocument
			data={Route.useLoaderData()}
			head={<HeadContent />}
			scripts={<Scripts />}
		>
			<Outlet />
		</AppDocument>
	);
}
