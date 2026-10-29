"use client";

import { MoreVertical } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

import type {
	MessageActionMenuProps,
	MessageMenuAction,
} from "./message-action-menu-types";

/** Both surfaces share one action model, so touch and keyboard menus stay in sync. */
export function MessageActionMenu({
	actions,
	open,
	onOpenChange,
	disabled,
}: MessageActionMenuProps) {
	const { t } = useLanguage();
	const mobile = useIsMobile();
	const trigger = (
		<Button
			variant="ghost"
			size="icon"
			className="shrink-0"
			disabled={disabled}
			aria-label={t("common.moreActions")}
		>
			<MoreVertical data-icon="inline-start" />
		</Button>
	);
	const select = (action: MessageMenuAction) => {
		onOpenChange(false);
		action.onSelect();
	};
	if (mobile) {
		return (
			<Drawer open={open} onOpenChange={onOpenChange}>
				<DrawerTrigger asChild>{trigger}</DrawerTrigger>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{t("common.moreActions")}</DrawerTitle>
						<DrawerDescription className="sr-only">
							{t("common.moveTo")}
						</DrawerDescription>
					</DrawerHeader>
					<div className="flex max-h-[65dvh] flex-col gap-1 overflow-y-auto overscroll-contain px-4 pb-safe-add-4">
						{actions.map((action, i) => (
							<Button
								key={i}
								variant="ghost"
								className="justify-start"
								disabled={action.disabled}
								onClick={() => select(action)}
							>
								{action.icon}
								{action.label}
							</Button>
						))}
					</div>
				</DrawerContent>
			</Drawer>
		);
	}
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuGroup>
					{actions.map((action, i) => (
						<DropdownMenuItem
							key={i}
							disabled={action.disabled}
							onSelect={() => select(action)}
						>
							{action.icon}
							{action.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
