"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup } from "@/lib/async-cleanup";
import { formatUserDate } from "@/lib/time/utils";
import { cn } from "@/lib/utils";

import { ContactAvatarForm } from "./contact-avatar-form";
import type {
	ContactDetailsRecord,
	ContactDetailsTriggerProps,
} from "./contact-details-types";
import {
	fetchContactDetails,
	updateContactName,
} from "./contact-details-utils";

export function ContactDetailsTrigger({
	mailboxId,
	address,
	name,
	label,
	className,
}: ContactDetailsTriggerProps) {
	const { t } = useLanguage();
	const translateEffect = useEffectEvent(t);
	const [open, setOpen] = useState(false);
	const visibleLabel = label ?? name;
	const [renamed, setRenamed] = useState<{
		from: string;
		value: string;
	} | null>(null);
	const shownName =
		renamed?.from === visibleLabel ? renamed.value : visibleLabel;
	const [contact, setContact] = useState<ContactDetailsRecord | null>(null);
	const [displayName, setDisplayName] = useState(name);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function handleOpenChange(next: boolean) {
		if (next) {
			setLoading(true);
			setError(null);
		}
		setOpen(next);
	}

	useEffect(() => {
		if (!open || !mailboxId) {
			return;
		}
		let cancelled = false;
		void fetchContactDetails(mailboxId, address)
			.then((nextContact) => {
				if (cancelled) {
					return null;
				}
				setContact(nextContact);
				setDisplayName(nextContact.displayName ?? name);

				return null;
			})
			.catch((loadError) => {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: translateEffect("contact.loadFailed")
					);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [address, mailboxId, name, open]);

	async function saveContact() {
		if (!mailboxId || !displayName.trim()) {
			return;
		}
		setSaving(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const updated = await updateContactName(
						mailboxId,
						address,
						displayName
					);
					const nextName = updated.displayName ?? displayName.trim();
					setContact(updated);
					if (!label) {
						setRenamed({ from: visibleLabel, value: nextName });
					}
					setOpen(false);
					window.dispatchEvent(
						new CustomEvent("mailflare:contact-changed", {
							detail: { displayName: nextName, email: updated.email },
						})
					);
				} catch (saveError) {
					setError(
						saveError instanceof Error
							? saveError.message
							: t("contact.updateFailed")
					);
				}
			},
			() => {
				setSaving(false);
			}
		);
	}

	if (!mailboxId) {
		return <span className={className}>{shownName}</span>;
	}

	return (
		<>
			<Button
				type="button"
				variant="quiet-link"
				size="inline"
				onClick={() => handleOpenChange(true)}
				className={cn(
					"text-left whitespace-normal active:not-disabled:scale-100",
					className
				)}
			>
				{shownName}
			</Button>
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("contact.title")}</DialogTitle>
						<DialogDescription>{t("contact.description")}</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<ContactAvatarForm
								mailboxId={mailboxId}
								address={address}
								name={displayName}
								hasAvatar={contact?.hasAvatar ?? false}
								onAvatarChange={(hasAvatar) =>
									setContact((current) =>
										current ? { ...current, hasAvatar } : current
									)
								}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="contact-display-name">
								{t("contact.name")}
							</FieldLabel>
							<Input
								autoComplete="name"
								enterKeyHint="done"
								id="contact-display-name"
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								disabled={loading || saving}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="contact-email">
								{t("contact.email")}
							</FieldLabel>
							<Input
								type="email"
								id="contact-email"
								value={contact?.email ?? address}
								disabled
							/>
						</Field>
						<div className="grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-2">
							<div>
								<p className="text-xs font-medium text-muted-foreground uppercase">
									{t("contact.source")}
								</p>
								<p className="mt-1 text-foreground/80 capitalize">
									{contact?.source ?? t("contact.sourceEmail")}
								</p>
							</div>
							<div>
								<p className="text-xs font-medium text-muted-foreground uppercase">
									{t("contact.lastSeen")}
								</p>
								<p className="mt-1 text-foreground/80">
									{contact?.lastSeenAt
										? formatUserDate(contact.lastSeenAt, {
												day: "2-digit",
												month: "short",
												year: "numeric",
											})
										: t("contact.unknown")}
								</p>
							</div>
							{contact?.blocked && (
								<p className="text-sm font-medium text-destructive">
									{t("contact.blocked")}
								</p>
							)}
						</div>
						{error && (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						)}
						<Button
							type="button"
							onClick={saveContact}
							disabled={loading || saving || !displayName.trim()}
						>
							{saving ? t("contact.saving") : t("contact.save")}
						</Button>
					</FieldGroup>
				</DialogContent>
			</Dialog>
		</>
	);
}
