"use client";

import { ChevronUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";

import { useIsMobile } from "./sidebar-mobile-utils";

interface SectionNavSheetProps {
	label: string;
	title: string;
	children: ReactNode;
	className?: string;
}

export function SectionNavSheet({
	label,
	title,
	children,
	className,
}: SectionNavSheetProps) {
	const mobile = useIsMobile();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [previousLocation, setPreviousLocation] = useState({
		mobile,
		pathname,
	});
	if (
		previousLocation.mobile !== mobile ||
		previousLocation.pathname !== pathname
	) {
		setPreviousLocation({ mobile, pathname });
		setOpen(false);
	}
	if (!mobile) {
		return (
			<aside aria-label={title} className={className}>
				{children}
			</aside>
		);
	}
	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>
				<Button
					variant="floating"
					size="lg"
					shape="pill"
					className="fixed bottom-safe-add-4 left-1/2 z-40 max-w-[85vw] -translate-x-1/2"
				>
					<span className="truncate">{label}</span>
					<ChevronUp data-icon="inline-end" />
				</Button>
			</DrawerTrigger>
			<DrawerContent aria-describedby={undefined}>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
				</DrawerHeader>
				<div className="max-h-[75dvh] overflow-y-auto overscroll-contain pb-safe-add-4">
					<div className={className}>{children}</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
