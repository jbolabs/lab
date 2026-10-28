"use client";

import type { ComponentProps } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export function AdminFormPanel(props: ComponentProps<typeof Sheet>) {
	const mobile = useIsMobile();
	return mobile ? <Drawer {...props} /> : <Sheet {...props} />;
}
export function AdminFormPanelTrigger(props: ComponentProps<typeof SheetTrigger>) {
	return useIsMobile() ? <DrawerTrigger {...props} /> : <SheetTrigger {...props} />;
}
export function AdminFormPanelContent({ className, ...props }: ComponentProps<typeof SheetContent>) {
	const mobile = useIsMobile();
	const classes = cn("flex flex-col gap-6 overflow-y-auto overscroll-contain p-6 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-md:[&_input]:text-base max-md:[&_button[data-slot=button]]:min-h-11", className);
	return mobile ? <DrawerContent className={cn(classes, "max-h-[90dvh]")} {...props} /> : <SheetContent className={cn(classes, "h-dvh w-full sm:max-w-xl")} {...props} />;
}
export function AdminFormPanelHeader(props: ComponentProps<typeof SheetHeader>) {
	return useIsMobile() ? <DrawerHeader className="p-0 text-left" {...props} /> : <SheetHeader className="p-0" {...props} />;
}
export function AdminFormPanelTitle(props: ComponentProps<typeof SheetTitle>) {
	return useIsMobile() ? <DrawerTitle {...props} /> : <SheetTitle {...props} />;
}
export function AdminFormPanelDescription(props: ComponentProps<typeof SheetDescription>) {
	return useIsMobile() ? <DrawerDescription {...props} /> : <SheetDescription {...props} />;
}
