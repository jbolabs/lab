import { getRequest } from "@tanstack/react-start/server";

import { getDb } from "@/db";
import { getBranding } from "@/lib/branding/service";
import { getEnv } from "@/lib/cloudflare";
import { loadPublicDriveListing } from "@/lib/drive/public-listing";

/** The shared root and what a link preview needs: absolute URLs, since crawlers resolve nothing. */
export async function loadPublicShare(token: string) {
	const env = getEnv();
	const [listing, branding] = await Promise.all([
		loadPublicDriveListing(getDb(env), token),
		getBranding(env),
	]);
	const origin =
		env.APP_URL?.trim().replace(/\/$/u, "") || new URL(getRequest().url).origin;
	return { appName: branding.appName, listing, origin };
}
