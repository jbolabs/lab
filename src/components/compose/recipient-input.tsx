"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroupInput } from "@/components/ui/input-group";
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
		if (entries.length > 0) {
			onChange([...value, ...entries]);
		}
		setDraft("");
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (
			event.key === "," ||
			event.key === ";" ||
			event.key === "Enter" ||
			(event.key === "Tab" && draft.trim())
		) {
			if (event.key !== "Tab") {
				event.preventDefault();
			}
			commit();
			return;
		}
		if (event.key === "Backspace" && !draft && value.length > 0) {
			event.preventDefault();
			const last = value.at(-1);
			onChange(value.slice(0, -1));
			setDraft(last ?? "");
		}
	}

	return (
		<div className="relative flex min-h-9 items-center gap-2 border-b border-border px-4 py-1 max-md:min-h-12 max-md:py-1.5">
			<Button
				type="button"
				variant="plain"
				size="none"
				tabIndex={-1}
				disabled={disabled}
				aria-label={label}
				className="absolute inset-0 w-full"
				onClick={() => inputRef.current?.focus()}
			/>
			<Label
				htmlFor={id}
				className="relative w-8 shrink-0 text-muted-foreground"
			>
				{label}
			</Label>
			<div className="pointer-events-none relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
				{value.map((entry) => {
					const valid = isValidRecipient(entry);
					return (
						<Badge
							variant={valid ? "secondary" : "destructive-soft"}
							key={entry}
							title={getEmailAddress(entry)}
							className="pointer-events-auto max-w-full"
							// oxlint-disable-next-line jsx-a11y/label-has-associated-control -- Base UI render: the text is this component's children.
							render={<label htmlFor={id} />}
						>
							<span className="truncate">{getRecipientLabel(entry)}</span>
							{!disabled && (
								<Button
									variant="ghost"
									size="icon-xs"
									type="button"
									aria-label={t("recipient.remove", {
										address: getEmailAddress(entry),
									})}
									// The visible button stays chip-sized; the ::after inset gives touch its 44pt target.
									className="relative after:absolute after:-inset-3"
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
				<InputGroupInput
					ref={inputRef}
					id={id}
					value={draft}
					onChange={(event) => {
						// A pasted list should split immediately instead of waiting for a comma.
						if (
							/[,;]/u.test(event.target.value) &&
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
					className="pointer-events-auto min-w-24"
				/>
			</div>
			{trailing && (
				// Toggles live inside the clickable row; keep their clicks from refocusing this field.
				<div className="relative flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
					{trailing}
				</div>
			)}
		</div>
	);
}
