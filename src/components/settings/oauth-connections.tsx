"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@/components/ui/item";
import { withCleanup, requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

import { useSettingsConfirm } from "./settings-confirm";
import { SettingsRowActions } from "./settings-row-actions";

interface Connection {
	id: string;
	name: string;
	scopes: string;
	expiresAt: number;
}
export function OAuthConnections() {
	const { t } = useLanguage();
	const { confirmation } = useSettingsConfirm();
	const [connections, setConnections] = useState<Connection[] | null>(null);
	const [error, setError] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		void authFetch("/api/oauth/connections", { signal: controller.signal })
			.then(async (response) => {
				requireSuccessfulResponse(response, "Could not update connection");
				const data = (await response.json()) as {
					connections: Connection[];
				};
				setConnections(data.connections);

				return null;
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					setError(true);
				}
			});
		return () => controller.abort();
	}, []);
	async function disconnect(id: string) {
		setBusy(id);
		setError(false);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch(
						`/api/oauth/connections?id=${encodeURIComponent(id)}`,
						{ method: "DELETE" }
					);
					requireSuccessfulResponse(response, "Could not update connection");
					setConnections(
						(items) => items?.filter((item) => item.id !== id) ?? []
					);
				} catch {
					setError(true);
				}
			},
			() => {
				setBusy(null);
			}
		);
	}
	return (
		<Card aria-labelledby="oauth-connections-title">
			{confirmation}
			<CardHeader>
				<CardTitle id="oauth-connections-title">
					{t("oauth.connections")}
				</CardTitle>
				<CardDescription>{t("oauth.connectionsDescription")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{t("oauth.connectionError")}</AlertDescription>
					</Alert>
				)}
				{connections === null && !error && (
					<output className="text-sm text-muted-foreground">
						{t("common.loading")}
					</output>
				)}
				{connections?.length === 0 && (
					<Empty>
						<EmptyDescription>{t("oauth.empty")}</EmptyDescription>
					</Empty>
				)}
				<ItemGroup>
					{connections?.map((connection) => (
						<Item key={connection.id}>
							<ItemContent className="min-w-0">
								<ItemTitle>{connection.name}</ItemTitle>
								<ItemDescription>
									{(JSON.parse(connection.scopes) as string[])
										.map((scope) =>
											t(`oauth.scope.${scope}` as Parameters<typeof t>[0])
										)
										.join(", ")}
								</ItemDescription>
							</ItemContent>
							<SettingsRowActions>
								<DropdownMenuItem
									disabled={busy !== null}
									onClick={() => disconnect(connection.id)}
								>
									{busy === connection.id
										? t("oauth.disconnecting")
										: t("oauth.disconnect")}
								</DropdownMenuItem>
							</SettingsRowActions>
						</Item>
					))}
				</ItemGroup>
			</CardContent>
		</Card>
	);
}
