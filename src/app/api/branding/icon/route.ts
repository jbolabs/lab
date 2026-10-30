import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { APP_SETTINGS_ID } from "@/lib/branding/service";
import { getEnvAsync } from "@/lib/cloudflare";

async function getDefaultIcon(env: CloudflareEnv): Promise<Response> {
	const asset = await env.ASSETS.fetch("https://mailflare.local/icon-96.png");
	return new Response(await asset.arrayBuffer(), {
		headers: asset.headers,
		status: asset.status,
		statusText: asset.statusText,
	});
}

export async function GET(_request: Request) {
	const env = await getEnvAsync();
	try {
		const [settings] = await getDb(env)
			.select({ iconKey: appSettings.iconKey })
			.from(appSettings)
			.where(eq(appSettings.id, APP_SETTINGS_ID))
			.limit(1);
		if (settings?.iconKey) {
			const object = await env.BUCKET.get(settings.iconKey);
			if (object) {
				return new Response(object.body, {
					headers: {
						"Cache-Control": "no-cache",
						"Content-Type": object.httpMetadata?.contentType ?? "image/png",
						"X-Content-Type-Options": "nosniff",
					},
				});
			}
		}
	} catch {
		// Use the packaged icon until the branding migration is available.
	}
	return getDefaultIcon(env);
}
