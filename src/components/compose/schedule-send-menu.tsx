"use client";

import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { ChevronDown, Clock, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { NewTemplateDialog } from "./new-template-dialog";
import { TemplateMenu } from "./template-menu";
import {
	formatDateTimeLocal,
	formatScheduledSend,
	getScheduleSendOptions,
	isPastSchedule,
	parseDateTimeLocal,
} from "./schedule-send-utils";
import type { ScheduleSendMenuProps } from "./schedule-send-types";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { ScheduleSendSheet } from "./schedule-send-sheet";
import { getUserTimeZone } from "@/lib/time/utils";

export function ScheduleSendMenu({
	disabled,
	value,
	onChange,
	mailboxId,
	from,
	onApplyTemplate,
}: ScheduleSendMenuProps) {
	const { t } = useLanguage();
	const [newTemplateOpen, setNewTemplateOpen] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const isPhone = useIsMobile();
	const [pickedText, setPickedText] = useState<string | null>(null);
	const options = getScheduleSendOptions();
	const picked = pickedText === null ? null : parseDateTimeLocal(pickedText);
	const pastPicked = picked !== null && isPastSchedule(picked);

	function pick(text: string) {
		const parsed = parseDateTimeLocal(text);
		setPickedText(text);
		if (!parsed) onChange(null);
		else if (!isPastSchedule(parsed)) onChange(parsed);
	}

	if (isPhone) {
		return (
			<>
				<Button
					type="button"
					disabled={disabled}
					aria-label={t("schedule.optionsLabel")}
					onClick={() => setSheetOpen(true)}
					variant="ghost"
					size="icon-lg"
					className="[@media(pointer:coarse)]:size-11"
				>
					<Clock />
				</Button>
				<ScheduleSendSheet
					open={sheetOpen}
					onOpenChange={setSheetOpen}
					value={value}
					onChange={onChange}
					onApplyTemplate={onApplyTemplate}
					onNewTemplate={() => setNewTemplateOpen(true)}
				/>
				<NewTemplateDialog
					open={newTemplateOpen}
					onOpenChange={setNewTemplateOpen}
					mailboxId={mailboxId}
					from={from}
				/>
			</>
		);
	}

	return (
		<>
			<DropdownMenu onOpenChange={() => setPickedText(null)}>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						disabled={disabled}
						aria-label={t("schedule.optionsLabel")}
						size="icon"
						className="size-8 rounded-l-none border-l border-primary-foreground/20 max-md:rounded-md [@media(pointer:coarse)]:size-11"
					>
						<ChevronDown data-icon="inline-start" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" sideOffset={6} className="min-w-64">
					<DropdownMenuGroup>
						<TemplateMenu
							onApply={onApplyTemplate}
							onNew={() => setNewTemplateOpen(true)}
						/>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
							{t("schedule.heading")}
						</DropdownMenuLabel>
						{value && (
							<>
								<DropdownMenuItem onSelect={() => onChange(null)}>
									<X className="mr-2 h-4 w-4" />
									{t("schedule.clear")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
						{options.map((option) => (
							<DropdownMenuItem
								key={option.labelKey}
								onSelect={() => onChange(option.value)}
							>
								{t(option.labelKey)}
								<span className="ml-2 text-xs text-muted-foreground">
									{option.value && formatScheduledSend(option.value)}
								</span>
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
							{t("schedule.pick", { timeZone: getUserTimeZone() })}
						</DropdownMenuLabel>
						<Input
							type="datetime-local"
							min={formatDateTimeLocal(new Date())}
							value={pickedText ?? (value ? formatDateTimeLocal(value) : "")}
							onChange={(event) => pick(event.target.value)}
							onKeyDown={(event) => event.stopPropagation()}
							aria-invalid={pastPicked}
							aria-describedby={pastPicked ? "schedule-past-time" : undefined}
							className="mx-2 mb-2 h-9 rounded-md border border-border px-2 text-sm outline-none focus:border-ring"
						/>
						{pastPicked && (
							<p
								id="schedule-past-time"
								role="alert"
								className="mx-2 mb-2 text-xs text-destructive"
							>
								{t("schedule.pastTime")}
							</p>
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<NewTemplateDialog
				open={newTemplateOpen}
				onOpenChange={setNewTemplateOpen}
				mailboxId={mailboxId}
				from={from}
			/>
		</>
	);
}
