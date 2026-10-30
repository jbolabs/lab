import type { loadBootstrap } from "@/lib/bootstrap.server";
import type { TranslationKey } from "@/lib/i18n/types";
import { createTranslator } from "@/lib/i18n/utils";

export function authRouteHead(key: TranslationKey, data: unknown) {
	const bootstrap = data as
		| Awaited<ReturnType<typeof loadBootstrap>>
		| undefined;
	if (!bootstrap) {
		return {};
	}
	const t = createTranslator(bootstrap.locale, bootstrap.messages);
	return { meta: [{ title: `${t(key)} - ${bootstrap.branding.appName}` }] };
}
