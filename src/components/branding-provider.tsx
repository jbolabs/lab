"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

import type { Branding } from "@/lib/branding/types";

import type { BrandingContextValue } from "./branding-provider-types";
import { DEFAULT_BRANDING, fetchBranding } from "./branding-provider-utils";

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({
	children,
	initialBranding,
}: {
	children: React.ReactNode;
	initialBranding?: Branding;
}) {
	const [branding, setBranding] = useState(initialBranding ?? DEFAULT_BRANDING);
	const [iconVersion, setIconVersion] = useState(0);

	const refreshBranding = useCallback(async () => {
		const nextBranding = await fetchBranding();
		setBranding(nextBranding);
		setIconVersion(Date.now());
		if (
			document.title === DEFAULT_BRANDING.appName ||
			document.title === branding.appName
		) {
			document.title = nextBranding.appName;
		}
	}, [branding.appName]);

	useEffect(() => {
		fetchBranding()
			.then((nextBranding) => {
				setBranding(nextBranding);
				setIconVersion(Date.now());
				if (
					document.title === DEFAULT_BRANDING.appName ||
					document.title === initialBranding?.appName
				) {
					document.title = nextBranding.appName;
				}
				return null;
			})
			.catch(() => {
				// Keep the server branding if the background refresh fails.
			});
	}, [initialBranding?.appName]);
	const value = useMemo(
		() => ({
			...branding,
			iconUrl: branding.hasCustomIcon
				? `/api/branding/icon?v=${iconVersion}`
				: "/icon-96.png",
			refreshBranding,
		}),
		[branding, iconVersion, refreshBranding]
	);

	return (
		<BrandingContext.Provider value={value}>
			{children}
		</BrandingContext.Provider>
	);
}

export function useBranding() {
	return (
		useContext(BrandingContext) ?? {
			...DEFAULT_BRANDING,
			iconUrl: "/icon-96.png",
			refreshBranding: () => Promise.resolve(),
		}
	);
}
