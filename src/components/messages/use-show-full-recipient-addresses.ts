"use client";

import { useCallback, useEffect, useState } from "react";

import {
	loadShowFullRecipientAddresses,
	updateShowFullRecipientAddresses,
} from "./use-show-full-recipient-addresses-utils";

/** The signed-in user's choice for To, Cc, and Bcc. Default is the mailbox only. */
export function useShowFullRecipientAddresses() {
	const [localEnabled, setLocalEnabled] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void loadShowFullRecipientAddresses()
			.then((stored) => {
				if (!cancelled) {
					setLocalEnabled(stored);
				}

				return null;
			})
			.catch((loadError) => {
				if (cancelled) {
					return;
				}
				setError(
					loadError instanceof Error
						? loadError.message
						: "Failed to load recipient address settings"
				);
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const setEnabled = useCallback(
		async (next: boolean) => {
			const previous = localEnabled;
			setLocalEnabled(next);
			setError(null);
			try {
				setLocalEnabled(await updateShowFullRecipientAddresses(next));
			} catch (updateError) {
				setLocalEnabled(previous);
				const message =
					updateError instanceof Error
						? updateError.message
						: "Failed to update recipient address settings";
				setError(message);
				throw new Error(message, { cause: updateError });
			}
		},
		[localEnabled]
	);

	return { enabled: localEnabled, error, isLoading, setEnabled };
}
