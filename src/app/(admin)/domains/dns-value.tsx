"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";
import {
	InputGroup,
	InputGroupInput,
	InputGroupAddon,
	InputGroupButton,
} from "@/components/ui/input-group";

export function DnsValue({ value }: { value: string }) {
	const { t } = useLanguage();
	const [copied, setCopied] = useState(false);
	return (
		<InputGroup className="min-w-0">
			<InputGroupInput readOnly value={value} aria-label={value} className="" />
			<InputGroupAddon align="inline-end">
				<InputGroupButton
					aria-label={t("common.copy")}
					onClick={() =>
						navigator.clipboard
							.writeText(value)
							.then(() => {
								setCopied(true);
								return setTimeout(() => setCopied(false), 2000);
							})
							.catch(() => toast.error(t("domains.requestFailed")))
					}
				>
					{copied ? <Check /> : <Copy />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
