import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono, Montserrat } from "next/font/google";

import { LanguageProvider } from "@/components/language-provider";
import { LaunchSplash } from "@/components/launch-splash";
import { Providers } from "@/components/providers";
import { sidebarBootstrapScript } from "@/components/sidebar-state-utils";
import { THEME_COLORS, themeBootstrapScript } from "@/components/theme-utils";
import { getRequestLocale, loadServerMessages } from "@/lib/i18n/server";
import { DEFAULT_LOCALE, getDirection } from "@/lib/i18n/utils";
import {
	getStartupImages,
	launchSeenScript,
} from "@/lib/launch/startup-screens-utils";
import { isNodeRuntime } from "@/lib/runtime";

import { getHomeBranding } from "./home-server-utils";

import "./globals.css";

// JBO Labs type: Figtree for the interface, Montserrat for the wordmark, Geist Mono for codes.
const figtree = Figtree({
	subsets: ["latin"],
	variable: "--font-figtree",
});

const montserrat = Montserrat({
	subsets: ["latin"],
	variable: "--font-montserrat",
	weight: ["200", "700"],
});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
});

export const viewport: Viewport = {
	initialScale: 1,
	interactiveWidget: "resizes-content",
	themeColor: [
		{ color: THEME_COLORS.light, media: "(prefers-color-scheme: light)" },
		{ color: THEME_COLORS.dark, media: "(prefers-color-scheme: dark)" },
	],
	viewportFit: "cover",
	width: "device-width",
};

export async function generateMetadata(): Promise<Metadata> {
	const { appName } = await getHomeBranding();
	return {
		appleWebApp: {
			capable: true,
			startupImage: getStartupImages(),
			statusBarStyle: "default",
			title: appName,
		},
		description: "Personal mail, calendar, and files",
		icons: { apple: "/apple-touch-icon.png", icon: "/api/branding/icon" },
		robots: {
			follow: false,
			googleBot: {
				follow: false,
				index: false,
				noarchive: true,
				noimageindex: true,
				nosnippet: true,
			},
			index: false,
			noarchive: true,
			noimageindex: true,
			nosnippet: true,
		},
		title: appName,
	};
}

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const locale = await getRequestLocale();
	const messages =
		locale === DEFAULT_LOCALE ? undefined : await loadServerMessages(locale);
	const branding = await getHomeBranding();
	return (
		<html
			lang={locale}
			dir={getDirection(locale)}
			data-remote-image-proxy={isNodeRuntime() ? "disabled" : "enabled"}
			suppressHydrationWarning
		>
			<head>
				{/* oxlint-disable-next-line react/no-danger -- Static first-party bootstrap must run before hydration to set theme, viewport and PWA state. */}
				<script dangerouslySetInnerHTML={{ __html: sidebarBootstrapScript }} />
				{/* oxlint-disable-next-line react/no-danger -- Static first-party bootstrap must run before hydration to set theme, viewport and PWA state. */}
				<script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
				{/* oxlint-disable-next-line react/no-danger -- Static first-party bootstrap must run before hydration to set theme, viewport and PWA state. */}
				<script dangerouslySetInnerHTML={{ __html: launchSeenScript }} />
				<link rel="icon" href="/api/branding/icon" />
			</head>
			<body
				className={`${figtree.variable} ${montserrat.variable} ${geistMono.variable} antialiased`}
			>
				<LaunchSplash />
				<LanguageProvider initialLocale={locale} initialMessages={messages}>
					<Providers initialBranding={branding}>{children}</Providers>
				</LanguageProvider>
			</body>
		</html>
	);
}
