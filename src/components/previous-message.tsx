import { ChevronRight } from "lucide-react";

import { useLanguage } from "@/components/language-provider";

import type { PreviousMessageProps } from "./previous-message-types";

export function PreviousMessage({ message }: PreviousMessageProps) {
	const { t } = useLanguage();
	return (
		<details className="group mt-4 border-l-2 border-border pl-4">
			<summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
				<ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
				<span>
					{t(
						message.direction === "sent"
							? "message.previous.sent"
							: "message.previous.received",
						{ date: message.dateLine }
					)}
				</span>
			</summary>
			<div className="pb-2 pl-5 text-muted-foreground">
				{message.content && (
					<pre className="font-sans text-sm whitespace-pre-wrap">
						{message.content}
					</pre>
				)}
				{message.quotedContent.map((nestedMessage, index) => (
					<PreviousMessage
						key={`${nestedMessage.dateLine}-${nestedMessage.content.slice(0, 24)}-${index}`}
						message={nestedMessage}
					/>
				))}
			</div>
		</details>
	);
}
