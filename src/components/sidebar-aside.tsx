"use client";

import { Menu } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode, TouchEvent } from "react";

import Link from "@/components/app-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { APP_NAME } from "@/lib/app-identity";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand";
import { EdgeSwipe } from "./edge-swipe";
import { useLanguage } from "./language-provider";
import { useSidebar } from "./sidebar-state";

const DRAWER_CLOSE_DISTANCE = 64;

export function SidebarAside({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const { mobile, mobileOpen, toggle } = useSidebar();
	const { t } = useLanguage();
	// The open drawer follows a leftward drag and closes past DRAWER_CLOSE_DISTANCE, like a native one.
	const dragStart = useRef<{
		x: number;
		y: number;
		horizontal: boolean | null;
	} | null>(null);
	const [dragX, setDragX] = useState(0);
	const drawerDrag = {
		onTouchEnd() {
			const close = dragX <= -DRAWER_CLOSE_DISTANCE;
			dragStart.current = null;
			setDragX(0);
			if (close) {
				haptic("selection");
				toggle();
			}
		},
		onTouchMove(event: TouchEvent) {
			const start = dragStart.current;
			if (!start) {
				return;
			}
			const dx = event.touches[0].clientX - start.x;
			const dy = event.touches[0].clientY - start.y;
			if (
				start.horizontal === null &&
				Math.max(Math.abs(dx), Math.abs(dy)) > 8
			) {
				start.horizontal = Math.abs(dx) > Math.abs(dy) && dx < 0;
			}
			if (start.horizontal) {
				setDragX(Math.min(0, dx));
			}
		},
		onTouchStart(event: TouchEvent) {
			dragStart.current = {
				horizontal: null,
				x: event.touches[0].clientX,
				y: event.touches[0].clientY,
			};
		},
	};
	if (mobile) {
		return (
			<>
				<EdgeSwipe
					disabled={mobileOpen}
					onOpenMenu={() => {
						if (!mobileOpen) {
							toggle();
						}
					}}
				/>
				<Sheet
					open={mobileOpen}
					onOpenChange={(open) => {
						if (open !== mobileOpen) {
							toggle();
						}
					}}
				>
					<SheetContent
						surface="sidebar"
						side="left"
						showCloseButton={false}
						aria-describedby={undefined}
						finalFocus={() =>
							document.querySelector<HTMLElement>("[data-mobile-menu]")
						}
						className={cn(
							"w-[min(85vw,320px)] transform-(--drawer-transform)",
							className
						)}
						style={
							dragX
								? ({
										"--drawer-transform": `translateX(${dragX}px)`,
										"--drawer-transition": "none",
									} as React.CSSProperties)
								: undefined
						}
						{...drawerDrag}
						onTouchCancel={() => drawerDrag.onTouchEnd()}
					>
						<SheetTitle className="sr-only">
							{t("navigation.openMenu")}
						</SheetTitle>
						{children}
					</SheetContent>
				</Sheet>
			</>
		);
	}
	return (
		<aside
			className={cn(
				"relative hidden min-h-0 min-w-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block md:w-(--sidebar-width)",
				className
			)}
		>
			{children}
		</aside>
	);
}

export function MobileMenuButton({ className }: { className?: string }) {
	const { t } = useLanguage();
	const { mobile, mobileOpen, toggle } = useSidebar();
	if (!mobile) {
		return null;
	}
	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon-lg"
				data-mobile-menu
				onClick={toggle}
				aria-label={t("navigation.openMenu")}
				aria-expanded={mobileOpen}
				className={cn("shrink-0 touch-manipulation md:hidden", className)}
			>
				<Menu />
			</Button>
			<Button
				variant="ghost"
				size="icon-lg"
				className="shrink-0 md:hidden"
				// Home: the launcher. On the home-screen web app there is no browser chrome, so this is the way back.
				render={
					<Link href="/" aria-label={t("home.homeLabel", { app: APP_NAME })} />
				}
				nativeButton={false}
			>
				<BrandMark size={26} />
			</Button>
		</>
	);
}

export function MobileTopBar({ title }: { title?: string }) {
	return (
		<div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar pt-safe pl-1 md:hidden">
			<MobileMenuButton />
			{title && (
				<p
					aria-hidden="true"
					className="min-w-0 truncate pr-3 text-sm font-medium"
				>
					{title}
				</p>
			)}
		</div>
	);
}
