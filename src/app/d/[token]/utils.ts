import { describeDriveItem, OG_IMAGE } from "@/lib/drive/share-preview-utils";

import type { PublicShare } from "./types";

export function publicShareUrl(origin: string, token: string, query = "") {
	return `${origin}/api/drive/public/${encodeURIComponent(token)}${query}`;
}

/** Open Graph and Twitter tags, so a shared link unfurls with the file's name, details and a picture of it. */
export function publicShareMeta(token: string, share: PublicShare | undefined) {
	const item = share?.listing?.item;
	if (!share || !item) {
		return [{ title: share?.appName ?? "Not found" }];
	}
	const description = describeDriveItem(item, share.listing?.items.length);
	const image = `${publicShareUrl(share.origin, token, "?og=1")}&v=${encodeURIComponent(item.updatedAt)}`;
	const meta: Record<string, string>[] = [
		{ title: item.name },
		{ content: description, name: "description" },
		{ content: item.name, property: "og:title" },
		{ content: description, property: "og:description" },
		{ content: share.appName, property: "og:site_name" },
		{ content: `${share.origin}/d/${token}`, property: "og:url" },
		{ content: image, property: "og:image" },
		{ content: String(OG_IMAGE.width), property: "og:image:width" },
		{ content: String(OG_IMAGE.height), property: "og:image:height" },
		{ content: item.name, property: "og:image:alt" },
		{ content: "summary_large_image", name: "twitter:card" },
		{ content: item.name, name: "twitter:title" },
		{ content: description, name: "twitter:description" },
		{ content: image, name: "twitter:image" },
	];
	if (item.kind === "file" && item.contentType.startsWith("video/")) {
		const video = publicShareUrl(share.origin, token, "?content=1");
		meta.push(
			{ content: "video.other", property: "og:type" },
			{ content: video, property: "og:video" },
			{ content: video, property: "og:video:secure_url" },
			{ content: item.contentType, property: "og:video:type" }
		);
	} else {
		meta.push({ content: "website", property: "og:type" });
	}
	return meta;
}
