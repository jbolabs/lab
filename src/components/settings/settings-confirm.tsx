"use client";
import { useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function useSettingsConfirm() {
	const { t } = useLanguage();
	const [message, setMessage] = useState<string | null>(null);
	const pendingAnswer = useRef<((answer: boolean) => void) | null>(null);
	function finish(answer: boolean) {
		pendingAnswer.current?.(answer);
		pendingAnswer.current = null;
		setMessage(null);
	}
	const confirm = (text: string) =>
		// oxlint-disable-next-line promise/avoid-new -- A user response arrives through dialog events and must resolve the awaiting action.
		new Promise<boolean>((resolve) => {
			pendingAnswer.current = resolve;
			setMessage(text);
		});
	const confirmation = (
		<AlertDialog
			open={message !== null}
			onOpenChange={(open) => {
				if (!open) {
					finish(false);
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("common.continue")}</AlertDialogTitle>
					<AlertDialogDescription>{message}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => finish(false)}>
						{t("common.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction onClick={() => finish(true)}>
						{t("common.continue")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
	return { confirm, confirmation };
}
