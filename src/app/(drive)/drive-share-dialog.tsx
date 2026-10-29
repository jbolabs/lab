"use client";
import { Copy, Link2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import type {
	DriveItemDto,
	DriveShareDto,
	DriveShareRole,
} from "@/lib/drive/types";

function DriveShareSession({
	item,
	onClose,
	onChanged,
}: {
	item: DriveItemDto | null;
	onClose: () => void;
	onChanged: () => void;
}) {
	const { t } = useLanguage();
	const mobile = useIsMobile();
	const Root = mobile ? Drawer : Dialog;
	const Content = mobile ? DrawerContent : DialogContent;
	const Header = mobile ? DrawerHeader : DialogHeader;
	const Title = mobile ? DrawerTitle : DialogTitle;
	const [shares, setShares] = useState<DriveShareDto[]>([]);
	const [linkToken, setLinkToken] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<DriveShareRole>("view");
	const [busy, setBusy] = useState(false);
	const id = item?.id;

	const load = useCallback(async () => {
		if (!id) {
			return;
		}
		const response = await authFetch(`/api/drive/items/${id}/shares`);
		if (!response.ok) {
			return toast.error(t("drive.shareFailed"));
		}
		const data = (await response.json()) as {
			shares: DriveShareDto[];
			linkToken: string | null;
		};
		setShares(data.shares);
		setLinkToken(data.linkToken);
	}, [id, t]);

	useEffect(() => {
		void (async () => {
			await load();
		})();
	}, [load]);

	function request(input: string, init: RequestInit) {
		setBusy(true);
		return withCleanup(
			async () => {
				const response = await authFetch(input, init);
				const data = (await response.json().catch(() => ({}))) as {
					shares?: DriveShareDto[];
					linkToken?: string | null;
					error?: string;
				};
				if (!response.ok) {
					toast.error(data.error ?? t("drive.shareFailed"));
					return null;
				}
				onChanged();
				return data;
			},
			() => {
				setBusy(false);
			}
		);
	}

	async function addPerson(event: React.FormEvent) {
		event.preventDefault();
		if (!item || !email.trim()) {
			return;
		}
		const data = await request(`/api/drive/items/${item.id}/shares`, {
			body: JSON.stringify({ email, role }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		if (data?.shares) {
			setShares(data.shares);
			setEmail("");
		}
	}

	async function removePerson(shareId: string) {
		if (!item) {
			return;
		}
		const data = await request(
			`/api/drive/items/${item.id}/shares?shareId=${encodeURIComponent(shareId)}`,
			{ method: "DELETE" }
		);
		if (data?.shares) {
			setShares(data.shares);
		}
	}

	async function toggleLink() {
		if (!item) {
			return;
		}
		const data = await request(`/api/drive/items/${item.id}/link`, {
			body: JSON.stringify({ enabled: !linkToken }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		if (data) {
			setLinkToken(data.linkToken ?? null);
		}
	}

	const linkUrl = linkToken ? `${window.location.origin}/d/${linkToken}` : "";

	return (
		<Root
			open={!!item}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<Content className="max-h-[90dvh] overflow-y-auto p-5 pb-safe-5">
				<Header>
					<Title className="truncate pr-6">
						{t("drive.shareTitle", { name: item?.name ?? "" })}
					</Title>
				</Header>
				<form onSubmit={addPerson}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="drive-share-email">
								{t("drive.shareEmail")}
							</FieldLabel>
							<Input
								id="drive-share-email"
								autoComplete="email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder={t("drive.shareEmail")}
								aria-label={t("drive.shareEmail")}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="drive-share-role">
								{t("drive.peopleWithAccess")}
							</FieldLabel>
							<NativeSelect
								id="drive-share-role"
								containerClassName="min-w-0 w-full"
								value={role}
								onChange={(event) =>
									setRole(event.target.value as DriveShareRole)
								}
								aria-label={t("drive.peopleWithAccess")}
							>
								<option value="view">{t("drive.canView")}</option>
								<option value="edit">{t("drive.canEdit")}</option>
							</NativeSelect>
						</Field>
						<Button type="submit" disabled={busy || !email.trim()}>
							{t("drive.shareAdd")}
						</Button>
					</FieldGroup>
				</form>
				<h3 className="mt-6 mb-2 text-sm font-medium text-foreground">
					{t("drive.peopleWithAccess")}
				</h3>
				{shares.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("drive.noPeople")}</p>
				) : (
					<ul className="flex flex-col gap-1">
						{shares.map((share) => (
							<li
								key={share.id}
								className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/60"
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-foreground">
										{share.name}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{share.email}
									</span>
								</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{share.role === "edit"
										? t("drive.canEdit")
										: t("drive.canView")}
								</span>
								<Button
									variant="ghost"
									type="button"
									onClick={() => removePerson(share.id)}
									disabled={busy}
									aria-label={t("drive.remove")}
									size="icon-sm"
								>
									<X data-icon="inline-start" />
								</Button>
							</li>
						))}
					</ul>
				)}
				<h3 className="mt-6 mb-2 text-sm font-medium text-foreground">
					{t("drive.generalAccess")}
				</h3>
				<div className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
					<Link2 size={18} className="shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1 text-foreground/80">
						{linkToken ? t("drive.linkOn") : t("drive.linkOff")}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={() => toggleLink()}
					>
						{linkToken ? t("drive.linkDisable") : t("drive.linkEnable")}
					</Button>
				</div>
				{linkToken && (
					<div className="mt-2 flex gap-2">
						<Input
							readOnly
							value={linkUrl}
							onFocus={(event) => event.currentTarget.select()}
							aria-label={t("drive.copyLink")}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								void navigator.clipboard
									.writeText(linkUrl)
									.then(() => toast.success(t("drive.linkCopied")));
							}}
						>
							<Copy data-icon="inline-start" />
							{t("drive.copyLink")}
						</Button>
					</div>
				)}
			</Content>
		</Root>
	);
}

export function DriveShareDialog(
	props: Parameters<typeof DriveShareSession>[0]
) {
	return <DriveShareSession key={props.item?.id ?? "closed"} {...props} />;
}
