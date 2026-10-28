"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** A focused, accessible confirmation that also resolves safely when its owner unmounts. */
export function useConfirmation() {
	const { t } = useLanguage();
	const [message, setMessage] = useState<string | null>(null);
	const resolve = useRef<((value: boolean) => void) | null>(null);
	useEffect(() => () => { resolve.current?.(false); }, []);
	function finish(value: boolean) {
		resolve.current?.(value);
		resolve.current = null;
		setMessage(null);
	}
	function confirm(message: string) {
		resolve.current?.(false);
		setMessage(message);
		return new Promise<boolean>((done) => { resolve.current = done; });
	}
	const confirmation = <AlertDialog open={message !== null} onOpenChange={(open) => { if (!open) finish(false); }}>
		<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("common.continue")}</AlertDialogTitle><AlertDialogDescription>{message}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => finish(false)}>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => finish(true)}>{t("common.continue")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
	</AlertDialog>;
	return { confirm, confirmation };
}
