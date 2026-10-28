"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import type { CommandItem as PaletteCommand } from "./types";
import type { TranslationKey } from "@/lib/i18n/types";
import {
	filterCommands,
	groupCommandsByCategory,
} from "./command-palette-utils";

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
	commands: PaletteCommand[];
}

export function CommandPalette({
	isOpen,
	onClose,
	commands,
}: CommandPaletteProps) {
	const { t } = useLanguage();
	const [query, setQuery] = useState("");
	const grouped = useMemo(
		() => groupCommandsByCategory(filterCommands(commands, query)),
		[commands, query],
	);
	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					setQuery("");
					onClose();
				}
			}}
		>
			<DialogContent className="overflow-hidden p-0" showCloseButton={false}>
				<DialogTitle className="sr-only">
					{t("palette.placeholder")}
				</DialogTitle>
				<DialogDescription className="sr-only">
					{t("palette.navigate")}
				</DialogDescription>
				<Command shouldFilter={false}>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder={t("palette.placeholder")}
						aria-label={t("palette.placeholder")}
					/>
					<CommandList className="max-h-[60dvh] overscroll-contain">
						<CommandEmpty>{t("palette.noMatch", { query })}</CommandEmpty>
						{Object.entries(grouped).map(([category, items]) => (
							<CommandGroup
								key={category}
								heading={t(`shortcut.category.${category}` as TranslationKey)}
							>
								{items.map((item) => {
									const Icon = item.icon;
									return (
										<CommandItem
											key={item.id}
											value={item.id}
											onSelect={() => {
												item.perform();
												setQuery("");
												onClose();
											}}
											className="min-h-11"
										>
											{Icon && <Icon />}
											<span className="min-w-0 flex-1">
												<span className="block truncate">{item.title}</span>
												{item.subtitle && (
													<span className="block truncate text-xs text-muted-foreground">
														{item.subtitle}
													</span>
												)}
											</span>
											{item.shortcut && (
												<CommandShortcut>
													<Kbd>{item.shortcut}</Kbd>
												</CommandShortcut>
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
				<div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
					<span>
						<Kbd>↑↓</Kbd> {t("palette.navigate")}
					</span>
					<span>
						<Kbd>↵</Kbd> {t("palette.select")}
					</span>
					<Kbd>Esc</Kbd>
				</div>
			</DialogContent>
		</Dialog>
	);
}
