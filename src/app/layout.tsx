import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono, Montserrat } from "next/font/google";
import { Providers } from "@/components/providers";
import { isNodeRuntime } from "@/lib/runtime";
import { LanguageProvider } from "@/components/language-provider";
import { DEFAULT_LOCALE, getDirection } from "@/lib/i18n/utils";
import { getRequestLocale, loadServerMessages } from "@/lib/i18n/server";
import { sidebarBootstrapScript } from "@/components/sidebar-state-utils";
import { THEME_COLORS, themeBootstrapScript } from "@/components/theme-utils";
import { getHomeBranding } from "./home-server-utils";
import "./globals.css";

// JBO Labs type: Figtree for the interface, Montserrat for the wordmark, Geist Mono for codes.
const figtree = Figtree({
	variable: "--font-figtree",
	subsets: ["latin"],
});

const montserrat = Montserrat({
	variable: "--font-montserrat",
	subsets: ["latin"],
	weight: ["200", "700"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	interactiveWidget: "resizes-content",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
		{ media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
	],
};

export async function generateMetadata(): Promise<Metadata> {
	const { appName } = await getHomeBranding();
	return {
		title: appName,
		description: "Personal mail, calendar, and files",
		icons: { icon: "/api/branding/icon", apple: "/apple-touch-icon.png" },
		appleWebApp: {
			capable: true,
			title: appName,
			statusBarStyle: "default",
		},
		robots: {
			index: false,
			follow: false,
			noarchive: true,
			nosnippet: true,
			noimageindex: true,
			googleBot: {
				index: false,
				follow: false,
				noarchive: true,
				nosnippet: true,
				noimageindex: true,
			},
		},
	};
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	const locale = await getRequestLocale();
	const messages = locale === DEFAULT_LOCALE ? undefined : await loadServerMessages(locale);
	const branding = await getHomeBranding();
	return (
		<html lang={locale} dir={getDirection(locale)} data-remote-image-proxy={isNodeRuntime() ? "disabled" : "enabled"} suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: sidebarBootstrapScript }} />
				<script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
				<link rel="icon" href="/api/branding/icon"></link>
			</head>
			<body className={`${figtree.variable} ${montserrat.variable} ${geistMono.variable} antialiased`}>
				<LanguageProvider initialLocale={locale} initialMessages={messages}><Providers initialBranding={branding}>{children}</Providers></LanguageProvider>
			</body>
		</html>
	);
}
