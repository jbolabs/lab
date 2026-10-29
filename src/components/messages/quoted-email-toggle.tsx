import { MoreHorizontal } from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { EmailHtmlRenderer } from "./email-html-renderer";
import type { QuotedEmailToggleProps } from "./quoted-email-toggle-types";

export function QuotedEmailToggle({
	html,
	autoAllowRemote,
	onAllowRemote,
}: QuotedEmailToggleProps) {
	const { t } = useLanguage();
	return (
		<Collapsible className="mt-4">
			<CollapsibleTrigger asChild>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label={t("message.quote.toggle")}
					title={t("message.quote.title")}
				>
					<MoreHorizontal data-icon="inline-start" />
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-3">
				<EmailHtmlRenderer
					html={html}
					preserveLeadingQuote
					autoAllowRemote={autoAllowRemote}
					onAllowRemote={onAllowRemote}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}
