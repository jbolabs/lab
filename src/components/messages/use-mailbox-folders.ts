"use client";

import { useEffect, useState } from "react";

import type { CustomFolder } from "@/components/dashboard-nav-types";
import { getClientSessionToken } from "@/lib/auth/client";
import { getMailboxFolders } from "@/lib/folders/client";

export function useMailboxFolders(
	mailboxId: string | undefined
): CustomFolder[] {
	const [fetched, setFetched] = useState<{
		mailboxId: string;
		sessionToken: string | null;
		folders: CustomFolder[];
	} | null>(null);

	useEffect(() => {
		if (!mailboxId) {
			return;
		}
		let cancelled = false;
		getMailboxFolders<{ folders?: CustomFolder[] }>(mailboxId)
			.then((data) => {
				const folders = data.folders ?? [];
				if (!cancelled) {
					setFetched({
						folders,
						mailboxId,
						sessionToken: getClientSessionToken(),
					});
				}

				return null;
			})
			.catch(() => {
				// Keep the current UI state when this optional background request fails.
			});
		return () => {
			cancelled = true;
		};
	}, [mailboxId]);

	if (!mailboxId) {
		return [];
	}
	return fetched?.mailboxId === mailboxId &&
		fetched.sessionToken === getClientSessionToken()
		? fetched.folders
		: [];
}
