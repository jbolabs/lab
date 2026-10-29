"use client";
import { ListFilter } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import { DRIVE_CATEGORIES } from "@/lib/drive/category-names";
import type { DriveCategory } from "@/lib/drive/category-names";
import { cn as clsx } from "@/lib/utils";

/** Multi-select filter by kind of file (photos, videos, documents, others). */
export function DriveTypeFilter({
	value: applied,
	onChange,
}: {
	value: DriveCategory[];
	onChange: (next: DriveCategory[]) => void;
}) {
	const { t } = useLanguage();
	// Local copy so quick successive clicks build on each other while the URL update is still in flight.
	const appliedKey = applied.join(",");
	const [optimistic, setOptimistic] = useState({
		key: appliedKey,
		value: applied,
	});
	const value = optimistic.key === appliedKey ? optimistic.value : applied;
	const update = (next: DriveCategory[]) => {
		setOptimistic({ key: appliedKey, value: next });
		onChange(next);
	};
	const labels: Record<DriveCategory, string> = {
		documents: t("drive.documents"),
		others: t("drive.others"),
		photos: t("drive.photos"),
		videos: t("drive.videos"),
	};
	const active = value.length > 0;
	return (
		<DropdownMenu.DropdownMenu>
			<DropdownMenu.DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					type="button"
					aria-label={t("drive.typeFilter")}
					className={clsx("shrink-0", active ? " " : "")}
				>
					<ListFilter data-icon="inline-start" />
					{t("drive.typeFilter")}
					{active && <Badge>{value.length}</Badge>}
				</Button>
			</DropdownMenu.DropdownMenuTrigger>
			<DropdownMenu.DropdownMenuPortal>
				<DropdownMenu.DropdownMenuContent align="end" sideOffset={6}>
					<DropdownMenu.DropdownMenuGroup>
						{DRIVE_CATEGORIES.map((category) => (
							<DropdownMenu.DropdownMenuCheckboxItem
								key={category}
								checked={value.includes(category)}
								onCheckedChange={(checked) =>
									update(
										checked
											? [...value, category]
											: value.filter((entry) => entry !== category)
									)
								}
								onSelect={(event) => event.preventDefault()}
							>
								{labels[category]}
							</DropdownMenu.DropdownMenuCheckboxItem>
						))}
						{active && (
							<>
								<DropdownMenu.DropdownMenuSeparator />
								<DropdownMenu.DropdownMenuItem onSelect={() => update([])}>
									{t("drive.clearFilter")}
								</DropdownMenu.DropdownMenuItem>
							</>
						)}
					</DropdownMenu.DropdownMenuGroup>
				</DropdownMenu.DropdownMenuContent>
			</DropdownMenu.DropdownMenuPortal>
		</DropdownMenu.DropdownMenu>
	);
}
