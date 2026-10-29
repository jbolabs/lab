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
	const resolve = useRef<((answer: boolean) => void) | null>(null);
	function finish(answer: boolean) {
		resolve.current?.(answer);
		resolve.current = null;
		setMessage(null);
	}
	const confirm = (text: string) =>
		new Promise<boolean>((done) => {
			resolve.current = done;
			setMessage(text);
		});
	const confirmation = (
		<AlertDialog
			open={message !== null}
			onOpenChange={(open) => {
				if (!open) finish(false);
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
