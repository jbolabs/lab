"use client";

import { Bell, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemGroup } from "@/components/ui/item";
import { withCleanup } from "@/lib/async-cleanup";
import { formatUserDate } from "@/lib/time/utils";

import type { MobileDevice } from "./device-settings-types";
import { loadDevices, signOutDevice } from "./device-settings-utils";
import { useSettingsConfirm } from "./settings-confirm";
import { SettingsRowActions } from "./settings-row-actions";
/**
 * Settings > Security card listing phones and tablets signed in with the
 * mobile app. Each holds a device key; signing one out revokes the key and
 * its push registration.
 */
export function DeviceSettings() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useSettingsConfirm();
	const [devices, setDevices] = useState<MobileDevice[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	useEffect(() => {
		loadDevices()
			.then(setDevices)
			.catch((error_) =>
				setError(
					error_ instanceof Error ? error_.message : t("devices.loadFailed")
				)
			);
	}, [t]);
	async function remove(device: MobileDevice) {
		if (!(await confirm(t("devices.signOutConfirm", { name: device.name })))) {
			return;
		}
		setBusy(device.id);
		return await withCleanup(
			async () => {
				try {
					await signOutDevice(device.id);
					setDevices(
						(list) => list?.filter((item) => item.id !== device.id) ?? null
					);
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("devices.loadFailed")
					);
				}
			},
			() => {
				setBusy(null);
			}
		);
	}
	if (!devices) {
		return (
			<p className="text-sm text-muted-foreground">
				{error ?? t("devices.loading")}
			</p>
		);
	}
	if (devices.length === 0) {
		return (
			<Empty>
				<EmptyDescription>{t("devices.empty")}</EmptyDescription>
			</Empty>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			{confirmation}
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
			<ItemGroup>
				{devices.map((device) => (
					<Item key={device.id}>
						<Smartphone className="size-5 shrink-0 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
								{device.name}
								{device.pushEnabled ? (
									<Bell
										className="size-3.5 text-muted-foreground/70"
										aria-label={t("devices.push")}
									/>
								) : null}
							</p>
							<p className="truncate text-sm text-muted-foreground">
								{t("devices.signedIn", {
									date: formatUserDate(device.createdAt, {
										dateStyle: "short",
									}),
								})}{" "}
								·{" "}
								{device.lastUsedAt
									? t("apiKeys.lastUsed", {
											date: formatUserDate(device.lastUsedAt, {
												dateStyle: "short",
											}),
										})
									: t("apiKeys.neverUsed")}
							</p>
						</div>
						<SettingsRowActions>
							<DropdownMenuItem
								disabled={busy === device.id}
								onClick={() => remove(device)}
							>
								{t("devices.signOut")}
							</DropdownMenuItem>
						</SettingsRowActions>
					</Item>
				))}
			</ItemGroup>
		</div>
	);
}
