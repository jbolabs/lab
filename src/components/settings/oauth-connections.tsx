"use client";
import { Item, ItemGroup } from "@/components/ui/item";
import { SettingsRowActions } from "./settings-row-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettingsConfirm } from "./settings-confirm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { authFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
type Connection = {
	id: string;
	name: string;
	scopes: string;
	expiresAt: number;
};
export function OAuthConnections() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useSettingsConfirm();
	const [connections, setConnections] = useState<Connection[] | null>(null);
	const [error, setError] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		void authFetch("/api/oauth/connections", { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error();
				const data = (await response.json()) as {
					connections: Connection[];
				};
				setConnections(data.connections);
			})
			.catch(() => {
				if (!controller.signal.aborted) setError(true);
			});
		return () => controller.abort();
	}, []);
	async function disconnect(id: string) {
		setBusy(id);
		setError(false);
		try {
			const response = await authFetch(
				`/api/oauth/connections?id=${encodeURIComponent(id)}`,
				{ method: "DELETE" },
			);
			if (!response.ok) throw new Error();
			setConnections((items) => items?.filter((item) => item.id !== id) ?? []);
		} catch {
			setError(true);
		} finally {
			setBusy(null);
		}
	}
	return (
		<Card
			className="flex flex-col gap-4 border-t border-border pt-6"
			aria-labelledby="oauth-connections-title"
		>
			{confirmation}
			<CardHeader><CardTitle id="oauth-connections-title">
				{t("oauth.connections")}
			</CardTitle>
			<CardDescription>
				{t("oauth.connectionsDescription")}
			</CardDescription>
			</CardHeader><CardContent>{error && (
				<Alert variant="destructive">
					<AlertDescription>{t("oauth.connectionError")}</AlertDescription>
				</Alert>
			)}
			{connections === null && !error && (
				<p role="status" className="text-sm text-muted-foreground">
					{t("common.loading")}
				</p>
			)}
			{connections?.length === 0 && (
				<Empty>
					<EmptyDescription>{t("oauth.empty")}</EmptyDescription>
				</Empty>
			)}
			<ItemGroup>
				{connections?.map((connection) => (
					<Item key={connection.id}>
						<CardHeader>
							<CardTitle>{connection.name}</CardTitle>
							<CardDescription>
								{(JSON.parse(connection.scopes) as string[])
									.map((scope) =>
										t(`oauth.scope.${scope}` as Parameters<typeof t>[0]),
									)
									.join(", ")}
							</CardDescription>
						</CardHeader>
						<SettingsRowActions>
							<DropdownMenuItem
								disabled={busy !== null}
								onClick={() => void disconnect(connection.id)}
							>
								{busy === connection.id
									? t("oauth.disconnecting")
									: t("oauth.disconnect")}
							</DropdownMenuItem>
						</SettingsRowActions>
					</Item>
				))}
			</ItemGroup>
		</CardContent></Card>
	);
}
