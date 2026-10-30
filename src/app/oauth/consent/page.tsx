import { useLoaderData } from "@tanstack/react-router";

import { ConsentForm } from "@/components/settings/oauth-consent";
import { PageTitle, PageDescription } from "@/components/ui/page-header";
import type { loadConsent } from "@/lib/consent.server";

export default function ConsentPage() {
	const data = useLoaderData({ strict: false }) as Awaited<
		ReturnType<typeof loadConsent>
	>;
	if ("error" in data) {
		return (
			<main className="mx-auto max-w-lg px-6 py-16">
				<PageTitle>
					{data.error === "expired"
						? "Connection request expired"
						: "Access unavailable"}
				</PageTitle>
				<PageDescription>
					{data.error === "expired"
						? "Return to your assistant and connect again."
						: "This account cannot approve the requested permissions. Return to your assistant and connect with an authorized account."}
				</PageDescription>
			</main>
		);
	}
	return <ConsentForm {...data} />;
}
