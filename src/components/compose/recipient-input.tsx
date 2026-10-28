"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { getEmailAddress } from "@/lib/email/address";

import type { RecipientInputProps } from "./recipient-input-types";
import {
	getRecipientLabel,
	isValidRecipient,
	parseRecipientEntries,
} from "./recipient-utils";

/**
 * A To/Cc/Bcc row. Addresses become chips as soon as the user types a comma,
 * presses Enter or Tab, pastes a list, or leaves the field; Backspace on an
 * empty field pulls the last chip back out for editing.
 */
export function RecipientInput({
	id,
	label,
	value,
	onChange,
	placeholder,
	disabled,
	required,
	autoFocus,
	trailing,
}: RecipientInputProps) {
	const { t } = useLanguage();
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	function commit(raw = draft) {
		const entries = parseRecipientEntries(raw, value);
		if (entries.length > 0) onChange([...value, ...entries]);
		setDraft("");
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (
			event.key === "," ||
			event.key === ";" ||
			event.key === "Enter" ||
			(event.key === "Tab" && draft.trim())
		) {
			if (event.key !== "Tab") event.preventDefault();
			commit();
			return;
		}
		if (event.key === "Backspace" && !draft && value.length > 0) {
			event.preventDefault();
			const last = value[value.length - 1];
			onChange(value.slice(0, -1));
			setDraft(last);
		}
	}

	return (
		<div
			className="flex min-h-9 items-center gap-2 border-b border-border px-4 py-1"
			onClick={() => inputRef.current?.focus()}
		>
			<Label
				htmlFor={id}
				className="w-8 shrink-0 text-sm text-muted-foreground"
			>
				{label}
			</Label>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
				{value.map((entry) => {
					const valid = isValidRecipient(entry);
					return (
						<Badge
							variant={valid ? "secondary" : "destructive"}
							key={entry}
							title={getEmailAddress(entry)}
							className="max-w-full gap-1 rounded-full"
						>
							<span className="truncate">{getRecipientLabel(entry)}</span>
							{!disabled && (
								<Button
									variant="ghost"
									size="icon"
									type="button"
									aria-label={t("recipient.remove", {
										address: getEmailAddress(entry),
									})}
									className="size-5 rounded-full [@media(pointer:coarse)]:size-11"
									onClick={(event) => {
										event.stopPropagation();
										onChange(value.filter((item) => item !== entry));
									}}
								>
									<X data-icon="inline-start" />
								</Button>
							)}
						</Badge>
					);
				})}
				<InputGroup className="h-auto min-w-32 flex-1">
					<InputGroupInput
						ref={inputRef}
						id={id}
						value={draft}
						onChange={(event) => {
							// A pasted list should split immediately instead of waiting for a comma.
							if (
								/[,;]/.test(event.target.value) &&
								event.target.value.length - draft.length > 1
							) {
								commit(event.target.value);
								return;
							}
							setDraft(event.target.value);
						}}
						onKeyDown={onKeyDown}
						onBlur={() => commit()}
						type="text"
						inputMode="email"
						enterKeyHint="next"
						autoCapitalize="none"
						autoCorrect="off"
						autoComplete="off"
						autoFocus={autoFocus}
						spellCheck={false}
						placeholder={value.length === 0 ? placeholder : undefined}
						disabled={disabled}
						// Native `required` would block submit while chips exist; the form checks itself.
						aria-required={required}
						className="min-h-9 [@media(pointer:coarse)]:text-base"
					/>
				</InputGroup>
			</div>
			{trailing && (
				// Toggles live inside the clickable row; keep their clicks from refocusing this field.
				<div
					className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
					onClick={(event) => event.stopPropagation()}
				>
					{trailing}
				</div>
			)}
		</div>
	);
}
