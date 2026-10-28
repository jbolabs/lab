"use client";

import type { CommandItem } from "./types";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface CommandPaletteItemProps {
	id: string;
	item: CommandItem;
	isActive: boolean;
	onSelect: () => void;
	onHover: () => void;
}
export function CommandPaletteItem({
	id,
	item,
	isActive,
	onSelect,
	onHover,
}: CommandPaletteItemProps) {
	const Icon = item.icon;
	return (
		<Button
			id={id}
			type="button"
			variant="ghost"
			role="option"
			aria-selected={isActive}
			tabIndex={-1}
			onClick={onSelect}
			onMouseEnter={onHover}
			className={cn(
				"h-auto min-h-11 w-full justify-start py-2.5",
				isActive && "bg-accent text-accent-foreground",
			)}
		>
			{Icon && <Icon data-icon="inline-start" />}
			<span className="min-w-0 flex-1 truncate text-left">
				{item.title}
				{item.subtitle && (
					<span className="ml-2 text-xs text-muted-foreground">
						{item.subtitle}
					</span>
				)}
			</span>
			{item.shortcut && <Kbd>{item.shortcut}</Kbd>}
		</Button>
	);
}
