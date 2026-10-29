"use client";

import { Copy, KeyRound } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	FieldLabel,
	Field,
	FieldLegend,
	FieldSet,
	FieldDescription,
	FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup } from "@/lib/async-cleanup";
import { cn } from "@/lib/utils";

import { buildSignInQrPayload } from "./sign-in-qr-utils";
import { createJmapApiKey } from "./utils";
/** Upper bound `POST /api/api-keys` places on `mailboxIds`. */
const MAX_KEY_MAILBOXES = 30;
function ConnectionField({
	label,
	value,
	onCopy,
	copied,
	mono,
}: {
	label: string;
	value: string;
	onCopy: (label: string, value: string) => void;
	copied: string | null;
	mono?: boolean;
}) {
	const { t } = useLanguage();
	return (
		<div className="flex items-center gap-3">
			<span className="w-36 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{label}
			</span>
			<code
				className={cn(
					"min-w-0 flex-1 truncate rounded-md bg-card px-2 py-1 text-sm",
					mono ? "font-mono" : "font-sans"
				)}
			>
				{value}
			</code>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => onCopy(label, value)}
				aria-label={t("common.copyLabel", { label })}
			>
				<Copy data-icon="inline-start" />
				{copied === label ? t("common.copied") : t("common.copy")}
			</Button>
		</div>
	);
}

/**
 * Settings > App passwords card for connecting an external mail app over JMAP.
 * Mints a mailbox-scoped API key with the `jmap` scope and shows the details once.
 * `POST /api/api-keys` requires `mailboxIds` for mail scopes, and a JMAP session
 * only lists the mailboxes a key was granted, so the card asks which to include.
 */
export function EmailClientsSettings() {
	const { t } = useLanguage();
	const { mailboxes, selectedMailbox, isLoading } = useSelectedMailbox();
	const [name, setName] = useState("");
	// `null` until the user changes the selection, which means every accessible mailbox —
	// the same set a key could see before keys were mailbox-scoped. The API accepts at
	// most 30 mailboxes per key, so past that the default is just the current mailbox.
	const [chosenMailboxIds, setChosenMailboxIds] = useState<string[] | null>(
		null
	);
	const mailboxIds =
		chosenMailboxIds ??
		(mailboxes.length <= MAX_KEY_MAILBOXES
			? mailboxes.map((mailbox) => mailbox.id)
			: [selectedMailbox?.id ?? mailboxes[0]?.id].filter(
					(id): id is string => !!id
				));
	const [key, setKey] = useState<string | null>(null);
	const [username, setUsername] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);
	const [qr, setQr] = useState<string | null>(null);
	const server = typeof window === "undefined" ? "" : window.location.origin;
	// The mobile app scans this to fill in the sign-in form; it carries the key, so it is
	// rendered in the browser and never leaves the page.
	useEffect(() => {
		if (!key) {
			return;
		}
		let cancelled = false;
		QRCode.toDataURL(buildSignInQrPayload({ email: username, key, server }), {
			errorCorrectionLevel: "M",
			margin: 1,
			width: 240,
		})
			.then((url) => {
				if (!cancelled) {
					setQr(url);
				}

				return null;
			})
			.catch(() => {
				if (!cancelled) {
					setQr(null);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [key, server, username]);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const created = await createJmapApiKey(
						name.trim() || t("emailClients.defaultName"),
						mailboxIds
					);
					// The server ignores the username, but mail apps want an email address there.
					const first = mailboxes.find(
						(mailbox) => mailbox.id === mailboxIds[0]
					);
					setUsername(first ? `${first.localPart}@${first.hostname}` : "");
					setKey(created);
					setName("");
				} catch (error_) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("emailClients.createFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}
	function copy(label: string, value: string) {
		void navigator.clipboard
			.writeText(value)
			.then(() => setCopied(label))
			.catch(() => setCopied(null));
	}
	function renderConnectionNote() {
		if (isLoading) {
			return (
				<p className="text-sm text-muted-foreground">
					{t("emailClients.loadingMailboxes")}
				</p>
			);
		}
		if (mailboxes.length === 0) {
			return (
				<p className="text-sm text-muted-foreground">
					{t("apiKeys.noMailboxes")}
				</p>
			);
		}
		return mailboxes.map((mailbox) => (
			<Field key={mailbox.id} orientation="horizontal">
				<FieldLabel className="min-h-11 w-full items-center">
					<Checkbox
						checked={mailboxIds.includes(mailbox.id)}
						onCheckedChange={(checked) =>
							setChosenMailboxIds(
								checked === true
									? [...mailboxIds, mailbox.id]
									: mailboxIds.filter((id) => id !== mailbox.id)
							)
						}
					/>
					{mailbox.localPart}@{mailbox.hostname}
				</FieldLabel>
			</Field>
		));
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				{t("emailClients.description")}
			</p>
			{key ? (
				<div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-4">
					<ConnectionField
						label={t("emailClients.server")}
						value={server}
						onCopy={copy}
						copied={copied}
					/>
					<ConnectionField
						label={t("emailClients.username")}
						value={username || t("emailClients.anyValue")}
						onCopy={copy}
						copied={copied}
					/>
					<ConnectionField
						label={t("emailClients.passwordApiKey")}
						value={key}
						onCopy={copy}
						copied={copied}
						mono
					/>
					{key && qr && (
						<div className="flex flex-col items-center gap-2 rounded-lg bg-card p-4">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={qr}
								alt={t("emailClients.qrAlt")}
								width={240}
								height={240}
							/>
							<p className="text-center text-xs text-muted-foreground">
								{t("emailClients.qrHint")}
							</p>
						</div>
					)}
					<p className="text-xs text-muted-foreground">
						{t("emailClients.shownOnce", { link: "\u0001", url: "\u0002" })
							// oxlint-disable-next-line eslint/no-control-regex -- Control sentinels split translated link placeholders without colliding with visible localized text.
							.split(/(?<placeholder>\u0001|\u0002)/u)
							.map((part, index) => {
								if (part === "\u0001") {
									return (
										<Link
											key={index}
											href="/settings/api-keys"
											className="text-signal underline"
										>
											{t("settings.nav.apiKeys")}
										</Link>
									);
								}
								if (part === "\u0002") {
									return <code key={index}>{server}/.well-known/jmap</code>;
								}
								return part;
							})}
					</p>
				</div>
			) : (
				<form onSubmit={submit}>
					<FieldGroup>
						<div className="flex flex-wrap items-end gap-3">
							<Field>
								<FieldLabel htmlFor="jmap-key-name">
									{t("emailClients.deviceName")}
								</FieldLabel>
								<Input
									id="jmap-key-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder={t("emailClients.devicePlaceholder")}
								/>
							</Field>
							<Button
								type="submit"
								disabled={
									busy ||
									isLoading ||
									!mailboxIds.length ||
									mailboxIds.length > MAX_KEY_MAILBOXES
								}
							>
								<KeyRound data-icon="inline-start" />
								{busy ? t("emailClients.creating") : t("emailClients.create")}
							</Button>
						</div>
						<FieldSet>
							<FieldLegend>{t("emailClients.mailboxesLegend")}</FieldLegend>
							{renderConnectionNote()}
							<FieldDescription>
								{t("emailClients.aliasLimit", { max: MAX_KEY_MAILBOXES })}
							</FieldDescription>
						</FieldSet>
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
					</FieldGroup>
				</form>
			)}
		</div>
	);
}
