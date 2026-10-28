"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";

export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
	const { t } = useLanguage();
	const [visible, setVisible] = useState(false);
	return (
		<InputGroup>
			<InputGroupInput {...props} type={visible ? "text" : "password"} />
			<InputGroupAddon align="inline-end">
				<InputGroupButton
					size="icon-sm"
					className="min-w-11"
					aria-label={t("auth.password")}
					aria-pressed={visible}
					aria-controls={props.id}
					onClick={() => setVisible((value) => !value)}
				>
					{visible ? <EyeOff /> : <Eye />}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
