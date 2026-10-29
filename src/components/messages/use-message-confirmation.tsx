"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function useMessageConfirmation() {
	const { t } = useLanguage();
	const [description, setDescription] = useState<string | null>(null);
	const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
	useEffect(() => () => resolveRef.current?.(false), []);
	function finish(accepted: boolean) {
		resolveRef.current?.(accepted);
		resolveRef.current = null;
		setDescription(null);
	}
	function confirm(description: string) {
		resolveRef.current?.(false);
		setDescription(description);
		return new Promise<boolean>(resolve => { resolveRef.current = resolve; });
	}
	const confirmation = <AlertDialog open={description !== null} onOpenChange={open => { if (!open) finish(false); }}>
		<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("common.deleteForever")}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => finish(false)}>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => finish(true)}>{t("common.deleteForever")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
	</AlertDialog>;
	return { confirm, confirmation };
}
