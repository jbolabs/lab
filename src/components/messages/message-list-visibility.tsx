"use client";

import { createContext, useContext } from "react";

import type { MessageListVisibility } from "./types";

export const MessageListVisibilityContext =
	createContext<MessageListVisibility>({
		backHref: "/inbox",
		backLabel: "Inbox",
		singleColumn: false,
		toggle: () => {
			/* No provider is mounted in the single-pane view. */
		},
		visible: true,
	});

export function useMessageListVisibility() {
	return useContext(MessageListVisibilityContext);
}
