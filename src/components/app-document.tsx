import type { ReactNode } from "react";

import { LanguageProvider } from "@/components/language-provider";
import { LaunchSplash } from "@/components/launch-splash";
import { Providers } from "@/components/providers";
import { sidebarBootstrapScript } from "@/components/sidebar-state-utils";
import { themeBootstrapScript } from "@/components/theme-utils";
import type { loadBootstrap } from "@/lib/bootstrap.server";
import { getDirection } from "@/lib/i18n/utils";
import { launchSeenScript } from "@/lib/launch/startup-screens-utils";

import "@fontsource-variable/figtree";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/geist-mono";

import "@/app/globals.css";

export function AppDocument({
	data: { locale, messages, branding, node },
	children,
	head,
	scripts,
}: {
	data: Awaited<ReturnType<typeof loadBootstrap>>;
	children: ReactNode;
	head?: ReactNode;
	scripts?: ReactNode;
}) {
	return (
		<html
			lang={locale}
			dir={getDirection(locale)}
			data-remote-image-proxy={node ? "disabled" : "enabled"}
			suppressHydrationWarning
		>
			<head>
				{[sidebarBootstrapScript, themeBootstrapScript, launchSeenScript].map(
					(script, index) => (
						// oxlint-disable-next-line react/no-danger -- Static first-party scripts set theme and PWA state before hydration.
						<script key={index} dangerouslySetInnerHTML={{ __html: script }} />
					)
				)}
				{head}
			</head>
			<body className="antialiased">
				<LaunchSplash />
				<LanguageProvider initialLocale={locale} initialMessages={messages}>
					<Providers initialBranding={branding}>{children}</Providers>
				</LanguageProvider>
				{scripts}
			</body>
		</html>
	);
}
