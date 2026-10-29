"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "./sidebar-state";
import { useLanguage } from "./language-provider";
import { BrandMark } from "./brand";
import { APP_NAME } from "@/lib/app-identity";
import { haptic } from "@/lib/haptics";
import { EdgeSwipe } from "./edge-swipe";

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
	const dragStart = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
	const [dragX, setDragX] = useState(0);
	const drawerDrag = {
		onTouchStart(event: TouchEvent) {
			dragStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, horizontal: null };
		},
		onTouchMove(event: TouchEvent) {
			const start = dragStart.current;
			if (!start) return;
			const dx = event.touches[0].clientX - start.x;
			const dy = event.touches[0].clientY - start.y;
			if (start.horizontal === null && Math.max(Math.abs(dx), Math.abs(dy)) > 8) start.horizontal = Math.abs(dx) > Math.abs(dy) && dx < 0;
			if (start.horizontal) setDragX(Math.min(0, dx));
		},
		onTouchEnd() {
			const close = dragX <= -DRAWER_CLOSE_DISTANCE;
			dragStart.current = null;
			setDragX(0);
			if (close) {
				haptic("selection");
				toggle();
			}
		},
	};
	if (mobile)
		return (
			<>
			<EdgeSwipe disabled={mobileOpen} onOpenMenu={() => { if (!mobileOpen) toggle(); }} />
			<Sheet
				open={mobileOpen}
				onOpenChange={(open) => {
					if (open !== mobileOpen) toggle();
				}}
			>
				<SheetContent
					side="left"
					showCloseButton={false}
					aria-describedby={undefined}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						document.querySelector<HTMLElement>("[data-mobile-menu]")?.focus();
					}}
					className={cn(
						"w-[min(85vw,320px)] gap-0 bg-sidebar text-sidebar-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
						className,
					)}
					style={dragX ? { transform: `translateX(${dragX}px)`, transition: "none" } : undefined}
					{...drawerDrag}
					onTouchCancel={drawerDrag.onTouchEnd}
				>
					<SheetTitle className="sr-only">
						{t("navigation.openMenu")}
					</SheetTitle>
					{children}
				</SheetContent>
			</Sheet>
			</>
		);
	return (
		<aside
			className={cn(
				"relative hidden min-h-0 min-w-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block md:w-[var(--sidebar-width)]",
				className,
			)}
		>
			{children}
		</aside>
	);
}

export function MobileMenuButton({ className }: { className?: string }) {
	const { t } = useLanguage();
	const { mobile, mobileOpen, toggle } = useSidebar();
	if (!mobile) return null;
	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				data-mobile-menu
				onClick={toggle}
				aria-label={t("navigation.openMenu")}
				aria-expanded={mobileOpen}
				className={cn(
					"size-11 shrink-0 touch-manipulation md:hidden",
					className,
				)}
			>
				<Menu />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				asChild
				className="size-11 shrink-0 md:hidden"
			>
				{/* Home: the launcher. On the home-screen web app there is no browser chrome, so this is the way back. */}
				<Link href="/" aria-label={t("home.homeLabel", { app: APP_NAME })}>
					<BrandMark size={26} />
				</Link>
			</Button>
		</>
	);
}

export function MobileTopBar({ title }: { title?: string }) {
	return (
		<div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar pl-1 pt-[env(safe-area-inset-top)] md:hidden">
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
