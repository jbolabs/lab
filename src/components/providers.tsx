"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { BrandingProvider } from "@/components/branding-provider";
import { clearMailboxClientState } from "@/components/mailbox-provider-utils";
import { NewMessagePopup } from "@/components/new-message-popup";
import { PwaServiceWorker } from "@/components/pwa-service-worker";
import { ThemeSync } from "@/components/theme-sync";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clearCurrentUserCache } from "@/hooks/use-current-user";
import { useMessagePolling } from "@/hooks/use-message-polling";
import { clearMessageClientState } from "@/hooks/utils";
import { AUTH_SESSION_CHANGED_EVENT } from "@/lib/auth/client";
import type { AuthSessionChangedDetail } from "@/lib/auth/client-types";
import type { Branding } from "@/lib/branding/types";
import { clearMessageDetailCache } from "@/lib/messages/detail-cache";

export function Providers({
	children,
	initialBranding,
}: {
	children: React.ReactNode;
	initialBranding?: Branding;
}) {
	const realtime = useMessagePolling();
	const handleDismissNotification = realtime.dismissNotification;

	// oxlint-disable-next-line react/hook-use-state -- The QueryClient is a lazy immutable provider instance and must never be replaced.
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchOnMount: false,
						refetchOnReconnect: false,
						refetchOnWindowFocus: false,
						staleTime: 60_000,
					},
				},
			})
	);

	useEffect(() => {
		function resetUserScopedState(event: Event) {
			client.clear();
			clearMailboxClientState();
			clearMessageClientState();
			clearMessageDetailCache();
			clearCurrentUserCache();
			// The dashboard layout outlives an account switch, so its all-mailbox counts (the app badge) would keep the old account's number.
			if (
				(event as CustomEvent<AuthSessionChangedDetail>).detail?.authenticated
			) {
				window.dispatchEvent(new Event("mailflare:message-counts-changed"));
			}
		}

		window.addEventListener(AUTH_SESSION_CHANGED_EVENT, resetUserScopedState);
		return () =>
			window.removeEventListener(
				AUTH_SESSION_CHANGED_EVENT,
				resetUserScopedState
			);
	}, [client]);

	return (
		<QueryClientProvider client={client}>
			<BrandingProvider initialBranding={initialBranding}>
				<TooltipProvider>
					<PwaServiceWorker />
					{children}
					<ThemeSync />
					<Toaster />
					<output aria-live="polite">
						{realtime.notification && (
							<NewMessagePopup
								notification={realtime.notification}
								onDismiss={handleDismissNotification}
							/>
						)}
					</output>
				</TooltipProvider>
			</BrandingProvider>
		</QueryClientProvider>
	);
}
