"use client";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

export function SettingsRowActions({ children }: { children: ReactNode }) {
	const { t } = useLanguage();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={t("common.moreActions")}
						onClick={(event) => event.stopPropagation()}
					/>
				}
			>
				<MoreHorizontal data-icon="inline-start" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>{children}</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
