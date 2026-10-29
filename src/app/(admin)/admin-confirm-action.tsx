"use client";
import { useState } from "react";
import type { ReactElement } from "react";

import { useLanguage } from "@/components/language-provider";
import {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { runAsyncAction } from "@/lib/async-cleanup";

/** Confirmation stays open while an async action runs, including failures. */
export function AdminConfirmAction({
	children,
	open: controlledOpen,
	onOpenChange,
	title,
	description,
	confirmLabel,
	match,
	onConfirm,
	disabled = false,
}: {
	children?: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel: string;
	match?: string;
	onConfirm: () => unknown;
	disabled?: boolean;
}) {
	const { t } = useLanguage();
	const [localOpen, setLocalOpen] = useState(false);
	const open = controlledOpen ?? localOpen;
	const setOpen = onOpenChange ?? setLocalOpen;
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!busy) {
					setOpen(next);
					setValue("");
					setError("");
				}
			}}
		>
			{children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
			<AlertDialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{match && (
					<Field>
						<FieldLabel htmlFor="confirm-hostname">
							{t("domains.hostname")}
						</FieldLabel>
						<Input
							id="confirm-hostname"
							autoComplete="off"
							autoCapitalize="none"
							spellCheck={false}
							placeholder={match}
							value={value}
							onChange={(event) => setValue(event.target.value)}
						/>
					</Field>
				)}
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>
						{t("common.cancel")}
					</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={
							disabled ||
							busy ||
							(!!match && value.trim().toLowerCase() !== match.toLowerCase())
						}
						onClick={() => {
							setBusy(true);
							setError("");
							return runAsyncAction(
								async () => {
									await onConfirm();
									setOpen(false);
									setValue("");
								},
								(failure) => {
									setError(
										failure instanceof Error ? failure.message : String(failure)
									);
								},
								() => {
									setBusy(false);
								}
							);
						}}
					>
						{confirmLabel}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
