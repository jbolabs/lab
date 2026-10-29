"use client";
import { Button } from "@/components/ui/button";

import { useEffect, useState } from "react";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import { cn as clsx } from "@/lib/utils";
import { Check, ListFilter } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { DRIVE_CATEGORIES } from "@/lib/drive/category-names";
import type { DriveCategory } from "@/lib/drive/category-names";

/** Multi-select filter by kind of file (photos, videos, documents, others). */
export function DriveTypeFilter({ value: applied, onChange }: { value: DriveCategory[]; onChange: (next: DriveCategory[]) => void }) {
	const { t } = useLanguage();
	// Local copy so quick successive clicks build on each other while the URL update is still in flight.
	const [value, setValue] = useState(applied);
	const appliedKey = applied.join(",");
	useEffect(() => { setValue(appliedKey ? (appliedKey.split(",") as DriveCategory[]) : []); }, [appliedKey]);
	const update = (next: DriveCategory[]) => { setValue(next); onChange(next); };
	const labels: Record<DriveCategory, string> = { photos: t("drive.photos"), videos: t("drive.videos"), documents: t("drive.documents"), others: t("drive.others") };
	const active = value.length > 0;
	return (
		<DropdownMenu.DropdownMenu>
			<DropdownMenu.DropdownMenuTrigger asChild>
				<Button variant="ghost" type="button" aria-label={t("drive.typeFilter")} className={clsx("flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm", active ? "border-signal/30 bg-signal-soft text-signal-soft-foreground" : "border-border text-foreground/80 hover:bg-accent")}>
					<ListFilter data-icon="inline-start" />{t("drive.typeFilter")}{active && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{value.length}</span>}
				</Button>
			</DropdownMenu.DropdownMenuTrigger>
			<DropdownMenu.DropdownMenuPortal>
				<DropdownMenu.DropdownMenuContent align="end" sideOffset={6}><DropdownMenu.DropdownMenuGroup>
					{DRIVE_CATEGORIES.map((category) => (
						<DropdownMenu.DropdownMenuCheckboxItem
							key={category}
							checked={value.includes(category)}
							onCheckedChange={(checked) => update(checked ? [...value, category] : value.filter((entry) => entry !== category))}
							onSelect={(event) => event.preventDefault()}
							className="relative flex cursor-pointer items-center rounded-lg py-2 pl-8 pr-3 text-sm text-foreground/80 outline-none data-[highlighted]:bg-accent"
						>

							{labels[category]}
						</DropdownMenu.DropdownMenuCheckboxItem>
					))}
					{active && (
						<>
							<DropdownMenu.DropdownMenuSeparator />
							<DropdownMenu.DropdownMenuItem onSelect={() => update([])} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-foreground/80 outline-none data-[highlighted]:bg-accent">{t("drive.clearFilter")}</DropdownMenu.DropdownMenuItem>
						</>
					)}
				</DropdownMenu.DropdownMenuGroup></DropdownMenu.DropdownMenuContent>
			</DropdownMenu.DropdownMenuPortal>
		</DropdownMenu.DropdownMenu>
	);
}
