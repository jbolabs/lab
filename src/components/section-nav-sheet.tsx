"use client";

import { ChevronUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useIsMobile } from "./sidebar-mobile-utils";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";

type SectionNavSheetProps = {
	label: string;
	title: string;
	children: ReactNode;
	className?: string;
};

export function SectionNavSheet({
	label,
	title,
	children,
	className,
}: SectionNavSheetProps) {
	const mobile = useIsMobile();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	useEffect(() => {
		setOpen(false);
	}, [pathname, mobile]);
	if (!mobile)
		return (
			<aside aria-label={title} className={className}>
				{children}
			</aside>
		);
	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>
				<Button className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 min-h-11 max-w-[85vw] -translate-x-1/2 rounded-full">
					<span className="truncate">{label}</span>
					<ChevronUp data-icon="inline-end" />
				</Button>
			</DrawerTrigger>
			<DrawerContent aria-describedby={undefined}>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
				</DrawerHeader>
				<div className="max-h-[75dvh] overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<div className={className}>{children}</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
