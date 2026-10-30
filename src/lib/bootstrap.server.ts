import { getHomeBranding } from "@/app/home-server-utils";
import { getRequestLocale, loadServerMessages } from "@/lib/i18n/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/utils";
import { isNodeRuntime } from "@/lib/runtime";

export async function loadBootstrap() {
	const locale = await getRequestLocale();
	const [messages, branding] = await Promise.all([
		locale === DEFAULT_LOCALE ? undefined : loadServerMessages(locale),
		getHomeBranding(),
	]);
	return { branding, locale, messages, node: isNodeRuntime() };
}
