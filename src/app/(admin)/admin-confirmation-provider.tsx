"use client";

import {
	useCallback,
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ReactNode } from "react";

import { useLanguage } from "@/components/language-provider";

import { AdminConfirmAction } from "./admin-confirm-action";

const ConfirmationContext = createContext<
	((description: string) => Promise<boolean>) | null
>(null);
export function AdminConfirmationProvider({
	children,
}: {
	children: ReactNode;
}) {
	const { t } = useLanguage();
	const [description, setDescription] = useState<string | null>(null);
	const pending = useRef<((confirmed: boolean) => void) | null>(null);
	function finish(confirmed: boolean) {
		pending.current?.(confirmed);
		pending.current = null;
		setDescription(null);
	}
	useEffect(
		() => () => {
			pending.current?.(false);
		},
		[]
	);
	const confirm = useCallback((text: string) => {
		const { promise, resolve } = Promise.withResolvers<boolean>();
		pending.current?.(false);
		pending.current = resolve;
		setDescription(text);
		return promise;
	}, []);
	return (
		<ConfirmationContext.Provider value={confirm}>
			{children}
			<AdminConfirmAction
				open={description !== null}
				onOpenChange={(open) => {
					if (!open) {
						finish(false);
					}
				}}
				title={t("common.continue")}
				description={description ?? ""}
				confirmLabel={t("common.continue")}
				onConfirm={() => finish(true)}
			/>
		</ConfirmationContext.Provider>
	);
}
export function useAdminConfirmation() {
	const confirm = useContext(ConfirmationContext);
	if (!confirm) {
		throw new Error("AdminConfirmationProvider is required");
	}
	return confirm;
}
