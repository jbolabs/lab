"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { authFetch } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

type Connection = { id: string; name: string; scopes: string; expiresAt: number };
export function OAuthConnections() {
	const { t } = useLanguage();
	const [connections, setConnections] = useState<Connection[] | null>(null);
	const [error, setError] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		void authFetch("/api/oauth/connections", { signal: controller.signal }).then(async (response) => {
			if (!response.ok) throw new Error();
			const data = await response.json() as { connections: Connection[] };
			setConnections(data.connections);
		}).catch(() => { if (!controller.signal.aborted) setError(true); });
		return () => controller.abort();
	}, []);
	async function disconnect(id: string) {
		setBusy(id); setError(false);
		try {
			const response = await authFetch(`/api/oauth/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
			if (!response.ok) throw new Error();
			setConnections((items) => items?.filter((item) => item.id !== id) ?? []);
		} catch { setError(true); } finally { setBusy(null); }
	}
	return <section className="space-y-4 border-t border-border pt-6" aria-labelledby="oauth-connections-title">
		<h2 id="oauth-connections-title" className="text-xl font-medium">{t("oauth.connections")}</h2>
		<p className="text-sm text-muted-foreground">{t("oauth.connectionsDescription")}</p>
		{error && <p role="alert" className="text-sm text-red-700">{t("oauth.connectionError")}</p>}
		{connections === null && !error && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
		{connections?.length === 0 && <p className="text-sm text-muted-foreground">{t("oauth.empty")}</p>}
		<ul className="divide-y divide-border">{connections?.map((connection) => <li key={connection.id} className="flex flex-wrap items-start justify-between gap-4 py-4"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{connection.name}</h3><p className="mt-1 text-sm text-muted-foreground">{(JSON.parse(connection.scopes) as string[]).map((scope) => t(`oauth.scope.${scope}` as Parameters<typeof t>[0])).join(", ")}</p></div><Button variant="outline" type="button" disabled={busy !== null} onClick={() => void disconnect(connection.id)}>{busy === connection.id ? t("oauth.disconnecting") : t("oauth.disconnect")}</Button></li>)}</ul>
	</section>;
}
