"use client";
import { Item, ItemGroup } from "@/components/ui/item";
import { SettingsRowActions } from "./settings-row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { useSettingsConfirm } from "./settings-confirm";
import { useEffect, useState } from "react";
import { Bell, Smartphone } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { formatUserDate } from "@/lib/time/utils";
import type { MobileDevice } from "./device-settings-types";
import { loadDevices, signOutDevice } from "./device-settings-utils";
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
			.catch((err) =>
				setError(err instanceof Error ? err.message : t("devices.loadFailed")),
			);
	}, [t]);
	async function remove(device: MobileDevice) {
		if (!(await confirm(t("devices.signOutConfirm", { name: device.name }))))
			return;
		setBusy(device.id);
		try {
			await signOutDevice(device.id);
			setDevices(
				(list) => list?.filter((item) => item.id !== device.id) ?? null,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : t("devices.loadFailed"));
		} finally {
			setBusy(null);
		}
	}
	if (!devices)
		return (
			<p className="text-sm text-muted-foreground">
				{error ?? t("devices.loading")}
			</p>
		);
	if (devices.length === 0)
		return (
			<Empty>
				<EmptyDescription>{t("devices.empty")}</EmptyDescription>
			</Empty>
		);
	return (
		<div className="flex flex-col gap-3">
			{confirmation}
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
			<ItemGroup>
				{devices.map((device) => (
					<Item key={device.id}>
						<Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
								{device.name}
								{device.pushEnabled ? (
									<Bell
										className="h-3.5 w-3.5 text-muted-foreground/70"
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
