"use client";
import { createContext, useContext } from "react";
import type { ComponentProps } from "react";

import * as Desktop from "@/components/ui/dialog";
import * as Mobile from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

const MobileContext = createContext(false);
export function Dialog(
	props: ComponentProps<typeof Desktop.Dialog> &
		ComponentProps<typeof Mobile.Drawer>
) {
	const mobile = useIsMobile();
	return (
		<MobileContext.Provider value={mobile}>
			{mobile ? <Mobile.Drawer {...props} /> : <Desktop.Dialog {...props} />}
		</MobileContext.Provider>
	);
}
export function DialogTrigger(
	props: ComponentProps<typeof Desktop.DialogTrigger> &
		ComponentProps<typeof Mobile.DrawerTrigger>
) {
	return useContext(MobileContext) ? (
		<Mobile.DrawerTrigger {...props} />
	) : (
		<Desktop.DialogTrigger {...props} />
	);
}
export function DialogContent({
	children,
	className,
	...props
}: ComponentProps<typeof Desktop.DialogContent>) {
	return useContext(MobileContext) ? (
		<Mobile.DrawerContent>
			<div className="flex max-h-[80dvh] flex-col gap-5 overflow-y-auto overscroll-contain px-5 pt-4 pb-safe-6">
				{children}
			</div>
		</Mobile.DrawerContent>
	) : (
		<Desktop.DialogContent className={className} {...props}>
			{children}
		</Desktop.DialogContent>
	);
}
export function DialogHeader(
	props: ComponentProps<typeof Desktop.DialogHeader>
) {
	return useContext(MobileContext) ? (
		<Mobile.DrawerHeader {...props} />
	) : (
		<Desktop.DialogHeader {...props} />
	);
}
export function DialogTitle(props: ComponentProps<typeof Desktop.DialogTitle>) {
	return useContext(MobileContext) ? (
		<Mobile.DrawerTitle {...props} />
	) : (
		<Desktop.DialogTitle {...props} />
	);
}
export function DialogDescription(
	props: ComponentProps<typeof Desktop.DialogDescription>
) {
	return useContext(MobileContext) ? (
		<Mobile.DrawerDescription {...props} />
	) : (
		<Desktop.DialogDescription {...props} />
	);
}
