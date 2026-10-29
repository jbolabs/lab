"use client";

import { useEffect, useRef, useState } from "react";

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

export function useMessageConfirmation() {
	const { t } = useLanguage();
	const [labels, setLabels] = useState<{
		title: string;
		action: string;
	} | null>(null);
	const [description, setDescription] = useState<string | null>(null);
	const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
	useEffect(() => () => resolveRef.current?.(false), []);
	function finish(accepted: boolean) {
		resolveRef.current?.(accepted);
		resolveRef.current = null;
		setDescription(null);
	}
	function confirm(
		nextDescription: string,
		nextLabels?: { title: string; action: string }
	) {
		resolveRef.current?.(false);
		setDescription(nextDescription);
		setLabels(nextLabels ?? null);
		const pending = Promise.withResolvers<boolean>();
		resolveRef.current = pending.resolve;
		return pending.promise;
	}
	const confirmation = (
		<AlertDialog
			open={description !== null}
			onOpenChange={(open) => {
				if (!open) {
					finish(false);
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{labels?.title ?? t("common.deleteForever")}
					</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => finish(false)}>
						{t("common.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={() => finish(true)}>
						{labels?.action ?? t("common.deleteForever")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
	return { confirm, confirmation };
}
