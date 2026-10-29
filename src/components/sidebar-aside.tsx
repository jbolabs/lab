"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "./sidebar-state";
import { useLanguage } from "./language-provider";
import { BrandMark } from "./brand";
import { APP_NAME } from "@/lib/app-identity";

export function SidebarAside({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const { mobile, mobileOpen, toggle } = useSidebar();
	const { t } = useLanguage();
	if (mobile)
		return (
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
				>
					<SheetTitle className="sr-only">
						{t("navigation.openMenu")}
					</SheetTitle>
					{children}
				</SheetContent>
			</Sheet>
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
