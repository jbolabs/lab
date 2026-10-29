"use client";

import { useEffect } from "react";

import { markMessagesReadInCaches } from "@/hooks/utils";
import { authFetch } from "@/lib/auth/client";

export function MarkAsRead({ messageId }: { messageId: string }) {
	useEffect(() => {
		authFetch(`/api/messages/${messageId}/read`, { method: "POST" })
			.then((response) => {
				if (!response.ok) {
					return null;
				}
				markMessagesReadInCaches([messageId], true);
				window.dispatchEvent(new Event("mailflare:messages-changed"));

				return null;
			})
			.catch(() => {
				// silently fail
			});
	}, [messageId]);

	return null;
}
