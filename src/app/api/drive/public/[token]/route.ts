import { getDb } from "@/db";
import { getBranding } from "@/lib/branding/service";
import { getEnv } from "@/lib/cloudflare";
import { getPublicDriveItem } from "@/lib/drive/access";
import { streamDriveFile } from "@/lib/drive/content";
import {
	listDriveChildren,
	loadPublicDriveListing,
} from "@/lib/drive/public-listing";
import {
	drivePosterResponse,
	shareImageResponse,
} from "@/lib/drive/share-preview";

import type { DriveTokenParams } from "./types";

/** Public, unauthenticated access to an item (and its subtree) shared by link. */
export async function GET(request: Request, { params }: DriveTokenParams) {
	const { token } = await params;
	const env = getEnv();
	const db = getDb(env);
	const url = new URL(request.url);
	const target = url.searchParams.get("item");
	const resolved = await getPublicDriveItem(db, token, target);
	if (!resolved) {
		return Response.json({ error: "Link not found" }, { status: 404 });
	}
	const { item } = resolved;
	if (
		url.searchParams.get("content") === "1" ||
		url.searchParams.get("download") === "1"
	) {
		return streamDriveFile(
			env,
			request,
			item,
			url.searchParams.get("download") === "1"
		);
	}
	if (url.searchParams.get("poster") === "1") {
		return drivePosterResponse(env, item);
	}
	if (url.searchParams.get("og") === "1") {
		const [children, branding] = await Promise.all([
			item.kind === "folder" ? listDriveChildren(db, item.id) : [],
			getBranding(env),
		]);
		return shareImageResponse(
			env,
			request,
			item,
			children.length,
			branding.appName
		);
	}
	return Response.json(await loadPublicDriveListing(db, token, target));
}
