"use client";

import type { ComponentProps } from "react";

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function AdminFormPanel(props: ComponentProps<typeof Sheet>) {
	const mobile = useIsMobile();
	return mobile ? <Drawer {...props} /> : <Sheet {...props} />;
}
export function AdminFormPanelTrigger(
	props: ComponentProps<typeof SheetTrigger>
) {
	return useIsMobile() ? (
		<DrawerTrigger {...props} />
	) : (
		<SheetTrigger {...props} />
	);
}
export function AdminFormPanelContent({
	className,
	...props
}: ComponentProps<typeof SheetContent>) {
	const mobile = useIsMobile();
	const classes = cn(
		"flex flex-col overflow-y-auto overscroll-contain",
		className
	);
	return mobile ? (
		<DrawerContent className={cn(classes, "")} {...props} />
	) : (
		<SheetContent
			className={cn(classes, "h-dvh w-full sm:max-w-xl")}
			{...props}
		/>
	);
}
export function AdminFormPanelHeader(
	props: ComponentProps<typeof SheetHeader>
) {
	return useIsMobile() ? (
		<DrawerHeader className="text-left" {...props} />
	) : (
		<SheetHeader className="" {...props} />
	);
}
export function AdminFormPanelTitle(props: ComponentProps<typeof SheetTitle>) {
	return useIsMobile() ? <DrawerTitle {...props} /> : <SheetTitle {...props} />;
}
export function AdminFormPanelDescription(
	props: ComponentProps<typeof SheetDescription>
) {
	return useIsMobile() ? (
		<DrawerDescription {...props} />
	) : (
		<SheetDescription {...props} />
	);
}
