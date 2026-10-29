"use client";
import { Copy } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

import type { McpAgentInstructionsProps } from "./mcp-agent-instructions-types";
import { buildMcpAgentPrompt } from "./mcp-agent-instructions-utils";

function subscribeOrigin() {
	return () => {
		// The page origin does not change during this document lifetime.
	};
}
function clientOrigin() {
	return window.location.origin;
}
function serverOrigin() {
	return "";
}

export function McpAgentInstructions(props: McpAgentInstructionsProps) {
	const { t } = useLanguage();
	const origin = useSyncExternalStore(
		subscribeOrigin,
		clientOrigin,
		serverOrigin
	);
	const [copied, setCopied] = useState(false);
	const prompt = buildMcpAgentPrompt(origin, props);
	return (
		<div className="flex flex-col gap-2 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-3">
				<strong className="text-sm">{t("mcp.instructions")}</strong>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() =>
						navigator.clipboard.writeText(prompt).then(() => setCopied(true))
					}
				>
					<Copy data-icon="inline-start" />
					{copied ? t("common.copied") : t("mcp.copyPrompt")}
				</Button>
			</div>
			<pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-3 text-xs break-all whitespace-pre-wrap text-foreground/80">
				{prompt}
			</pre>
		</div>
	);
}
