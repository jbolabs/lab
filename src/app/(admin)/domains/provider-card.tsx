import type { ReactNode } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { StatusBadge } from "./status-row";

interface Props {
	title: string;
	description: string;
	/** true = set up, false = needs setup, null = unknown or not applicable (no icon). */
	ok: boolean | null;
	selected: boolean;
	disabled?: boolean;
	onToggle: (on: boolean) => void;
	/** Configuration shown while the option is selected. */
	children?: ReactNode;
	/** Shown on an unselected option that still has configuration. */
	cleanup?: {
		present: boolean;
		busy: boolean;
		disabled?: boolean;
		onClick: () => void;
	} | null;
}

/** One selectable provider: icon-left header with a switch, its config when on, a clean-up bar when off but configured. */
export default function ProviderCard({
	title,
	description,
	ok,
	selected,
	disabled,
	onToggle,
	children,
	cleanup,
}: Props) {
	const { t } = useLanguage();
	return (
		<li>
			<Card className="">
				<CardHeader className="px-4">
					<div className="flex items-start justify-between gap-3">
						{ok !== null && <StatusBadge ok={ok} tone="neutral" />}
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<CardTitle>{title}</CardTitle>
							<CardDescription>{description}</CardDescription>
						</div>
						<Switch
							aria-label={title}
							checked={selected}
							disabled={disabled}
							onCheckedChange={onToggle}
						/>
					</div>
				</CardHeader>
				{selected && children && (
					<CardContent className="px-4 pt-4">{children}</CardContent>
				)}
				{!selected && cleanup?.present && (
					<div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
						<span>{t("domains.stillSetUp", { title })}</span>
						<Button
							size="sm"
							variant="outline"
							disabled={cleanup.busy || cleanup.disabled}
							onClick={() => cleanup.onClick()}
						>
							{cleanup.busy ? t("domains.removing") : t("domains.cleanUp")}
						</Button>
					</div>
				)}
			</Card>
		</li>
	);
}
