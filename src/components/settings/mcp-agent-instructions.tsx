"use client";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { buildMcpAgentPrompt } from "./mcp-agent-instructions-utils";
import type { McpAgentInstructionsProps } from "./mcp-agent-instructions-types";
export function McpAgentInstructions(props: McpAgentInstructionsProps) {
	const { t } = useLanguage();
	const [origin, setOrigin] = useState("");
	const [copied, setCopied] = useState(false);
	useEffect(() => setOrigin(window.location.origin), []);
	const prompt = buildMcpAgentPrompt(origin, props);
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
			<div className="flex items-center justify-between gap-3">
				<strong className="text-sm">{t("mcp.instructions")}</strong>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() =>
						void navigator.clipboard
							.writeText(prompt)
							.then(() => setCopied(true))
					}
				>
					<Copy data-icon="inline-start" />
					{copied ? t("common.copied") : t("mcp.copyPrompt")}
				</Button>
			</div>
			<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-3 text-xs text-foreground/80">
				{prompt}
			</pre>
		</div>
	);
}
