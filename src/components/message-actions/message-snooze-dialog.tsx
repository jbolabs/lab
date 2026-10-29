"use client";

import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import {
	getSnoozePresets,
	snoozeMessage,
} from "@/components/messages/message-list-row-actions-utils";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { withCleanup } from "@/lib/async-cleanup";
import { getUserTimeZone } from "@/lib/time/utils";

import type { MessageSnoozeDialogProps } from "./types";

export function MessageSnoozeDialog({
	messageId,
	open,
	onOpenChange,
}: MessageSnoozeDialogProps) {
	const { t } = useLanguage();
	const mobile = useIsMobile();
	const Root = mobile ? Drawer : Dialog;
	const Content = mobile ? DrawerContent : DialogContent;
	const Header = mobile ? DrawerHeader : DialogHeader;
	const Title = mobile ? DrawerTitle : DialogTitle;
	const Description = mobile ? DrawerDescription : DialogDescription;
	const [snoozedUntil, setSnoozedUntil] = useState(
		() => getSnoozePresets()[0].value
	);
	const [snoozing, setSnoozing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const snoozePresets = getSnoozePresets();

	async function handleSnooze() {
		setSnoozing(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					await snoozeMessage(messageId, snoozedUntil);
					onOpenChange(false);
				} catch (nextError) {
					setError(
						nextError instanceof Error ? nextError.message : t("snooze.failed")
					);
				}
			},
			() => {
				setSnoozing(false);
			}
		);
	}

	return (
		<Root open={open} onOpenChange={onOpenChange}>
			<Content>
				<Header>
					<Title>{t("snooze.title")}</Title>
					<Description>{t("snooze.description")}</Description>
				</Header>
				<FieldGroup>
					<ToggleGroup
						type="single"
						variant="outline"
						value={snoozedUntil}
						onValueChange={(value) => {
							if (value) {
								setSnoozedUntil(value);
							}
						}}
						className="flex flex-wrap"
					>
						{snoozePresets.map((preset) => (
							<ToggleGroupItem
								key={preset.labelKey}
								value={preset.value}
								className="flex-1"
							>
								{t(preset.labelKey)}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<Field data-invalid={!!error}>
						<FieldLabel htmlFor={`header-snooze-until-${messageId}`}>
							{t("snooze.selectDateTime", { timeZone: getUserTimeZone() })}
						</FieldLabel>
						<Input
							id={`header-snooze-until-${messageId}`}
							aria-invalid={!!error}
							type="datetime-local"
							value={snoozedUntil}
							onChange={(event) => setSnoozedUntil(event.target.value)}
						/>
					</Field>
					{error && <FieldError>{error}</FieldError>}
					<Button
						type="button"
						onClick={() => handleSnooze()}
						disabled={snoozing}
					>
						{snoozing ? t("common.snoozing") : t("common.snooze")}
					</Button>
				</FieldGroup>
			</Content>
		</Root>
	);
}
