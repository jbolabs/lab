"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import { AdminConfirmAction } from "./admin-confirm-action";

const ConfirmationContext = createContext<((description: string) => Promise<boolean>) | null>(null);
export function AdminConfirmationProvider({ children }: { children: ReactNode }) {
	const { t } = useLanguage();
	const [description, setDescription] = useState<string | null>(null);
	const pending = useRef<((confirmed: boolean) => void) | null>(null);
	function finish(confirmed: boolean) {
		pending.current?.(confirmed);
		pending.current = null;
		setDescription(null);
	}
	useEffect(() => () => { pending.current?.(false); }, []);
	return <ConfirmationContext.Provider value={(text) => new Promise<boolean>((resolve) => {
		pending.current?.(false);
		pending.current = resolve;
		setDescription(text);
	})}>
		{children}
		<AdminConfirmAction open={description !== null} onOpenChange={(open) => { if (!open) finish(false); }} title={t("common.continue")} description={description ?? ""} confirmLabel={t("common.continue")} onConfirm={() => finish(true)} />
	</ConfirmationContext.Provider>;
}
export function useAdminConfirmation() {
	const confirm = useContext(ConfirmationContext);
	if (!confirm) throw new Error("AdminConfirmationProvider is required");
	return confirm;
}
