"use client";

import { useState } from "react";
import { getSnoozePresets, snoozeMessage } from "@/components/messages/message-list-row-actions-utils";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import type { MessageSnoozeDialogProps } from "./types";
import { getUserTimeZone } from "@/lib/time/utils";

export function MessageSnoozeDialog({ messageId, open, onOpenChange }: MessageSnoozeDialogProps) {
	const { t } = useLanguage();
	const mobile = useIsMobile();
	const Root = mobile ? Drawer : Dialog;
	const Content = mobile ? DrawerContent : DialogContent;
	const Header = mobile ? DrawerHeader : DialogHeader;
	const Title = mobile ? DrawerTitle : DialogTitle;
	const Description = mobile ? DrawerDescription : DialogDescription;
	const [snoozedUntil, setSnoozedUntil] = useState(() => getSnoozePresets()[0].value);
	const [snoozing, setSnoozing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const snoozePresets = getSnoozePresets();

	async function handleSnooze() {
		setSnoozing(true);
		setError(null);
		try {
			await snoozeMessage(messageId, snoozedUntil);
			onOpenChange(false);
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : t("snooze.failed"));
		} finally {
			setSnoozing(false);
		}
	}

	return (
		<Root open={open} onOpenChange={onOpenChange}>
			<Content>
				<Header>
					<Title>{t("snooze.title")}</Title>
					<Description>{t("snooze.description")}</Description>
				</Header>
				<FieldGroup className="p-4 sm:p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<ToggleGroup type="single" variant="outline" value={snoozedUntil} onValueChange={value => { if (value) setSnoozedUntil(value); }} className="flex flex-wrap">
						{snoozePresets.map((preset) => (
							<ToggleGroupItem key={preset.labelKey} value={preset.value} className="min-h-11 flex-1">
								{t(preset.labelKey)}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<Field data-invalid={!!error}>
						<FieldLabel htmlFor={`header-snooze-until-${messageId}`} className="text-sm font-medium text-foreground/80">{t("snooze.selectDateTime", { timeZone: getUserTimeZone() })}</FieldLabel>
						<Input id={`header-snooze-until-${messageId}`} className="min-h-11 text-base" aria-invalid={!!error} type="datetime-local" value={snoozedUntil} onChange={(event) => setSnoozedUntil(event.target.value)} />
					</Field>
					{error && <FieldError>{error}</FieldError>}
					<Button className="min-h-11" type="button" onClick={() => void handleSnooze()} disabled={snoozing}>
						{snoozing ? t("common.snoozing") : t("common.snooze")}
					</Button>
				</FieldGroup>
			</Content>
		</Root>
	);
}
