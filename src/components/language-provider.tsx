"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ReactNode } from "react";

import type { Locale, Messages } from "@/lib/i18n/types";
import {
	DEFAULT_LOCALE,
	createTranslator,
	getDirection,
	loadMessages,
	resolveLocale,
	serializeLocaleCookie,
} from "@/lib/i18n/utils";

import type { LanguageState } from "./language-provider-types";

const LanguageContext = createContext<LanguageState>({
	locale: DEFAULT_LOCALE,
	setLocale: () => {
		// No provider or recoverable background failure requires an action.
	},
	t: createTranslator(DEFAULT_LOCALE),
});

interface Active {
	locale: Locale;
	messages?: Partial<Messages>;
}

/**
 * `initialMessages` is the catalog for `initialLocale`, loaded on the server so the first render is already
 * translated. English needs none; it is bundled. Other catalogs load on demand when the language changes.
 */
export function LanguageProvider({
	initialLocale,
	initialMessages,
	children,
}: {
	initialLocale: Locale;
	initialMessages?: Partial<Messages>;
	children: ReactNode;
}) {
	const [active, setActive] = useState<Active>({
		locale: initialLocale,
		messages: initialMessages,
	});
	const latestRequest = useRef(0);

	const setLocale = useCallback((next: Locale) => {
		const nextLocale = resolveLocale(next);
		latestRequest.current += 1;
		const request = latestRequest.current;
		void loadMessages(nextLocale)
			.then((messages) => {
				if (request !== latestRequest.current) {
					return null;
				}
				// Preference cookies can be disabled; the selection still works for this session.
				try {
					// oxlint-disable-next-line unicorn/no-document-cookie -- Standalone Safari must persist the locale cookie without requiring Cookie Store API support.
					document.cookie = serializeLocaleCookie(
						nextLocale,
						window.location.protocol === "https:"
					);
				} catch {
					// Keep the in-memory preference when cookie storage is unavailable.
				}
				document.documentElement.lang = nextLocale;
				document.documentElement.dir = getDirection(nextLocale);
				setActive({ locale: nextLocale, messages });

				return null;
			})
			.catch(() => {
				// No provider or recoverable background failure requires an action.
			});
	}, []);

	const value = useMemo<LanguageState>(
		() => ({
			locale: active.locale,
			setLocale,
			t: createTranslator(active.locale, active.messages),
		}),
		[active, setLocale]
	);

	return (
		<LanguageContext.Provider value={value}>
			{children}
		</LanguageContext.Provider>
	);
}

export function useLanguage() {
	return useContext(LanguageContext);
}
