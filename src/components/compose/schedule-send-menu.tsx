"use client";

import { ChevronDown, Clock, X } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useIsMobile } from "@/components/sidebar-mobile-utils";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getUserTimeZone } from "@/lib/time/utils";

import { NewTemplateDialog } from "./new-template-dialog";
import { ScheduleSendSheet } from "./schedule-send-sheet";
import type { ScheduleSendMenuProps } from "./schedule-send-types";
import {
	formatDateTimeLocal,
	formatScheduledSend,
	getScheduleSendOptions,
	isPastSchedule,
	parseDateTimeLocal,
} from "./schedule-send-utils";
import { TemplateMenu } from "./template-menu";

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
	const [minimum, setMinimum] = useState("");
	const [pickedText, setPickedText] = useState<string | null>(null);
	const options = getScheduleSendOptions();
	const picked = pickedText === null ? null : parseDateTimeLocal(pickedText);
	const pastPicked = picked !== null && isPastSchedule(picked);

	function pick(text: string) {
		const parsed = parseDateTimeLocal(text);
		setPickedText(text);
		if (!parsed) {
			onChange(null);
		} else if (!isPastSchedule(parsed)) {
			onChange(parsed);
		}
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
			<DropdownMenu
				onOpenChange={(open) => {
					setPickedText(null);
					if (open) {
						setMinimum(formatDateTimeLocal(new Date()));
					}
				}}
			>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							disabled={disabled}
							aria-label={t("schedule.optionsLabel")}
							size="icon-sm"
						/>
					}
				>
					<ChevronDown data-icon="inline-start" />
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" sideOffset={6} className="min-w-64">
					<DropdownMenuGroup>
						<TemplateMenu
							onApply={onApplyTemplate}
							onNew={() => setNewTemplateOpen(true)}
						/>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>{t("schedule.heading")}</DropdownMenuLabel>
						{value && (
							<>
								<DropdownMenuItem onClick={() => onChange(null)}>
									<X />
									{t("schedule.clear")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
						{options.map((option) => (
							<DropdownMenuItem
								key={option.labelKey}
								onClick={() => onChange(option.value)}
							>
								{t(option.labelKey)}
								<span className="ml-2">
									{option.value && formatScheduledSend(option.value)}
								</span>
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuLabel>
							{t("schedule.pick", { timeZone: getUserTimeZone() })}
						</DropdownMenuLabel>
						<Input
							type="datetime-local"
							min={minimum}
							value={pickedText ?? (value ? formatDateTimeLocal(value) : "")}
							onChange={(event) => pick(event.target.value)}
							onKeyDown={(event) => event.stopPropagation()}
							aria-invalid={pastPicked}
							aria-describedby={pastPicked ? "schedule-past-time" : undefined}
							className="mx-2 mb-2 w-[calc(100%-1rem)]"
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
