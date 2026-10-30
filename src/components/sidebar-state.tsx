"use client";

import {
	createContext,
	useCallback,
	useMemo,
	useContext,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";

import { usePathname } from "@/lib/navigation";

import {
	readColumnWidth,
	readInitialColumnWidth,
	saveColumnWidth,
} from "./column-width-preferences";
import { isMobileViewport, useIsMobile } from "./sidebar-mobile-utils";
import type { SidebarProviderProps, SidebarState } from "./sidebar-state-types";
import {
	readInitialSidebarMinimal,
	saveInitialSidebarMinimal,
	syncInitialSidebarWidth,
} from "./sidebar-state-utils";
import { useClientReady } from "./use-client-ready";

const SidebarContext = createContext<SidebarState>({
	minimal: false,
	mobile: false,
	mobileOpen: false,
	setForcedMinimal: () => {
		// No provider or recoverable background failure requires an action.
	},
	setWidth: () => {
		// No provider or recoverable background failure requires an action.
	},
	toggle: () => {
		// No provider or recoverable background failure requires an action.
	},
	userId: null,
	width: 260,
});

export function SidebarProvider({
	children,
	expandedWidth = 260,
	mobileOverlay = false,
}: SidebarProviderProps) {
	const [minimal, setMinimal] = useState(false);
	const [forcedMinimal, setForcedMinimal] = useState(false);
	const [width, setWidth] = useState(expandedWidth);
	const [widthReady, setWidthReady] = useState(false);
	const [userId, setUserId] = useState<string | null>(null);
	const [storageKey, setStorageKey] = useState<string | null>(null);
	const pathname = usePathname();
	const mobile = useIsMobile();
	const [mobileOpen, setMobileOpen] = useState(false);
	// Overlay layouts have no minified rail on phones: the menu is either fully shown over the page or hidden.
	const overlay = mobileOverlay && mobile;

	const clientReady = useClientReady();
	const [environment, setEnvironment] = useState({
		clientReady: false,
		expandedWidth,
		mobile,
		pathname,
	});
	if (
		environment.clientReady !== clientReady ||
		environment.expandedWidth !== expandedWidth ||
		environment.mobile !== mobile ||
		environment.pathname !== pathname
	) {
		setEnvironment({ clientReady, expandedWidth, mobile, pathname });
		setMobileOpen(false);
		if (
			clientReady &&
			(!environment.clientReady || environment.expandedWidth !== expandedWidth)
		) {
			setMinimal(readInitialSidebarMinimal());
			setWidth(readInitialColumnWidth("sidebar", expandedWidth, 200, 480));
		}
		if (mobile) {
			setMinimal(true);
		} else if (clientReady && environment.mobile !== mobile) {
			setMinimal(readInitialSidebarMinimal());
		}
	}
	useLayoutEffect(() => {
		const frame = requestAnimationFrame(() => setWidthReady(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	useLayoutEffect(() => {
		syncInitialSidebarWidth(width, minimal);
	}, [width, minimal]);

	useEffect(() => {
		// The sidebar preference is cosmetic, so every failure here degrades to the default.
		// Guard the parse: an error response may carry an empty or non-JSON body, and an
		// unhandled rejection here surfaces as a confusing SyntaxError overlay in dev.
		void fetch("/api/auth/me", { cache: "no-store" })
			.then(async (response) => {
				if (!response.ok) {
					return null;
				}
				return (await response.json()) as {
					user?: { id?: string };
				} | null;
			})
			.then((data) => {
				const currentUserId = data?.user?.id;
				if (!currentUserId) {
					return null;
				}
				setUserId(currentUserId);
				const key = `mailflare-sidebar-minimal:${currentUserId}`;
				setStorageKey(key);
				if (isMobileViewport()) {
					return null;
				}
				try {
					const storedMinimal = localStorage.getItem(key);
					const savedMinimal =
						storedMinimal === null
							? readInitialSidebarMinimal()
							: storedMinimal === "true";
					setMinimal(savedMinimal);
					saveInitialSidebarMinimal(savedMinimal);
					localStorage.setItem(key, String(savedMinimal));
					const savedWidth = readColumnWidth(
						currentUserId,
						"sidebar",
						readInitialColumnWidth("sidebar", expandedWidth, 200, 480),
						200,
						480
					);
					setWidth(savedWidth);
					saveColumnWidth(currentUserId, "sidebar", savedWidth);
				} catch {
					// Storage can be unavailable in private windows; keep the default.
				}

				return null;
			})
			.catch(() => {
				// No provider or recoverable background failure requires an action.
			});
	}, [expandedWidth]);

	const toggle = useCallback(() => {
		if (overlay) {
			setMobileOpen((current) => !current);
			return;
		}
		if (forcedMinimal) {
			setForcedMinimal(false);
			setMinimal(false);
			if (!isMobileViewport()) {
				saveInitialSidebarMinimal(false);
				if (storageKey) {
					localStorage.setItem(storageKey, "false");
				}
			}
			return;
		}
		setMinimal((current) => {
			const next = !current;
			if (!isMobileViewport()) {
				saveInitialSidebarMinimal(next);
				if (storageKey) {
					localStorage.setItem(storageKey, String(next));
				}
			}
			return next;
		});
	}, [forcedMinimal, overlay, storageKey]);
	const value = useMemo(
		() => ({
			minimal: !overlay && (minimal || forcedMinimal),
			mobile: overlay,
			mobileOpen,
			setForcedMinimal,
			setWidth,
			toggle,
			userId,
			width,
		}),
		[forcedMinimal, minimal, mobileOpen, overlay, toggle, userId, width]
	);
	return (
		<SidebarContext.Provider value={value}>
			<div
				className="h-full"
				style={
					{
						"--sidebar-transition-duration": widthReady ? "200ms" : "0ms",
						"--sidebar-width": widthReady
							? `${minimal || forcedMinimal ? 72 : width}px`
							: `var(--persisted-sidebar-width, ${expandedWidth}px)`,
					} as React.CSSProperties
				}
			>
				{children}
			</div>
		</SidebarContext.Provider>
	);
}

export function useSidebar() {
	return useContext(SidebarContext);
}
