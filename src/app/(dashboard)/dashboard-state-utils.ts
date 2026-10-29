const ASSISTANT_OPEN_KEY = "mailflare-dashboard:assistant-open";
const ASSISTANT_FULL_SIZE_KEY = "mailflare-dashboard:assistant-full-size";

export function readInitialAssistantPanelState() {
	if (typeof window === "undefined") {
		return { fullSize: false, open: false };
	}
	try {
		return {
			fullSize: localStorage.getItem(ASSISTANT_FULL_SIZE_KEY) === "true",
			open: localStorage.getItem(ASSISTANT_OPEN_KEY) === "true",
		};
	} catch {
		return { fullSize: false, open: false };
	}
}

export function saveAssistantPanelState(
	open: boolean,
	fullSize: boolean,
	userPrefix: string | null
) {
	try {
		localStorage.setItem(ASSISTANT_OPEN_KEY, String(open));
		localStorage.setItem(ASSISTANT_FULL_SIZE_KEY, String(fullSize));
		if (userPrefix) {
			localStorage.setItem(`${userPrefix}:assistant-open`, String(open));
			localStorage.setItem(
				`${userPrefix}:assistant-full-size`,
				String(fullSize)
			);
		}
	} catch {
		/* Storage is optional. */
	}
}
