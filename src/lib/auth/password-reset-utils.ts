import type { Translator } from "@/lib/i18n/utils";

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function buildPasswordResetEmail(
	t: Translator,
	{
		email,
		appName,
		link,
		minutes,
	}: { email: string; appName: string; link: string; minutes: number }
): { subject: string; text: string; html: string } {
	const ignore = t("auth.resetMail.ignore");
	return {
		html: `<p>${t("auth.resetMail.intro", { appName: escapeHtml(appName), email: `<b>${escapeHtml(email)}</b>` })}</p><p>${escapeHtml(t("auth.resetMail.instructions", { minutes }))}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>${escapeHtml(ignore)}</p>`,
		subject: t("auth.resetMail.subject", { appName }),
		text: [
			t("auth.resetMail.intro", { appName, email }),
			"",
			t("auth.resetMail.instructions", { minutes }),
			link,
			"",
			ignore,
		].join("\n"),
	};
}
