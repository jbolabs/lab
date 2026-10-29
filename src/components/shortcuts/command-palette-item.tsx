"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import type { CommandItem } from "./types";

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
			variant={isActive ? "secondary" : "ghost"}
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Rich listbox options require custom markup; native option only works inside select.
			role="option"
			aria-selected={isActive}
			tabIndex={-1}
			onClick={onSelect}
			onMouseEnter={onHover}
			className="w-full justify-start"
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
