import { getInlineContentType } from "@/lib/http/content-type";

import { driveKindOf } from "./kind";
import { describeDriveItem, OG_IMAGE } from "./share-preview-utils";
import type { DriveRow } from "./types";
import { driveObjectKey, drivePosterKey } from "./utils";

// Media Transformations reads at most this much of a video.
const MEDIA_INPUT_MAX_BYTES = 100 * 1024 * 1024;
// Images we pass through untouched when the Images binding is unavailable; crawlers skip larger ones.
const RAW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// The Images binding reads at most this much of a photo.
const IMAGES_INPUT_MAX_BYTES = 20 * 1024 * 1024;
// Stills at least this much wider than tall fill the card; narrower ones are shown whole.
const WIDE_ASPECT = 1.3;
const CARD_TEXT_MAX = 30;
const CARD_HEADERS = { "Cache-Control": "public, max-age=3600" };

/** Middle-truncates a name and keeps its extension, so "Quarterly report final.pdf" stays recognisable. */
export function fitCardText(text: string, max = CARD_TEXT_MAX): string {
	if (text.length <= max) {
		return text;
	}
	const dot = text.lastIndexOf(".");
	const tail = dot > 0 && text.length - dot <= 6 ? text.slice(dot - 3) : "";
	return `${text.slice(0, max - tail.length - 1).trimEnd()}…${tail}`;
}

// The card font covers Latin; other scripts would draw as boxes, so those names stay in the title only.
const LATIN = /^[ -ɏ‘-‟…]*$/u;

async function readPoster(env: CloudflareEnv, item: DriveRow) {
	const stored = await env.BUCKET.get(drivePosterKey(item.ownerId, item.id));
	if (stored) {
		return stored.arrayBuffer();
	}
	if (!env.MEDIA || item.size > MEDIA_INPUT_MAX_BYTES) {
		return null;
	}
	const source = await env.BUCKET.get(
		item.r2Key ?? driveObjectKey(item.ownerId, item.id)
	);
	if (!source) {
		return null;
	}
	try {
		const frame = await env.MEDIA.input(source.body)
			.transform({ fit: "scale-down", width: 1280 })
			.output({ format: "jpg", mode: "frame", time: "1s" })
			.media();
		const bytes = await new Response(frame).arrayBuffer();
		await env.BUCKET.put(drivePosterKey(item.ownerId, item.id), bytes, {
			httpMetadata: { contentType: "image/jpeg" },
		});
		return bytes;
	} catch (error) {
		console.warn("Video poster extraction failed", error);
		return null;
	}
}

/** A still frame of a shared video: the one its owner's browser captured, or one pulled by Media Transformations. */
export async function drivePosterResponse(
	env: CloudflareEnv,
	item: DriveRow
): Promise<Response> {
	const poster =
		item.contentType.startsWith("video/") && (await readPoster(env, item));
	if (!poster) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(poster, {
		headers: { ...CARD_HEADERS, "Content-Type": "image/jpeg" },
	});
}

function asStream(bytes: ArrayBuffer) {
	return new Response(bytes).body as ReadableStream<Uint8Array>;
}

async function asset(env: CloudflareEnv, origin: string, path: string) {
	const response = await env.ASSETS.fetch(new URL(path, origin));
	if (!response.ok || !response.body) {
		throw new Error(`Missing asset ${path}`);
	}
	return response.body as ReadableStream<Uint8Array>;
}

/**
 * Puts a photo or video still in the 1200×630 frame. Wide ones fill it; tall ones sit whole over a blurred copy of
 * themselves, so a portrait video is not cropped to a sliver of its middle.
 */
async function stillImage(
	env: CloudflareEnv,
	origin: string,
	bytes: ArrayBuffer,
	video: boolean
) {
	const info = await env.IMAGES.info(asStream(bytes));
	const wide = "width" in info && info.width / info.height >= WIDE_ASPECT;
	let image = env.IMAGES.input(asStream(bytes)).transform({
		fit: "cover",
		height: OG_IMAGE.height,
		width: OG_IMAGE.width,
	});
	if (!wide) {
		image = image.transform({ blur: 60, brightness: 0.7 }).draw(
			env.IMAGES.input(asStream(bytes)).transform({
				fit: "scale-down",
				height: OG_IMAGE.height,
				width: OG_IMAGE.width,
			})
		);
	}
	if (video) {
		image = image.draw(
			env.IMAGES.input(await asset(env, origin, "/og/play.png"))
		);
	}
	const result = await image.output({ format: "image/jpeg", quality: 85 });
	return result.response({ headers: CARD_HEADERS });
}

/** The kind's card with the file's name and details written on it. */
async function nameCard(
	env: CloudflareEnv,
	origin: string,
	item: DriveRow,
	childCount: number,
	appName: string
) {
	const kind = driveKindOf(item);
	const font = { url: new URL("/og/figtree-600.woff2", origin).href };
	let card = env.IMAGES.input(await asset(env, origin, `/og/${kind}.png`));
	if (LATIN.test(item.name)) {
		card = card.draw(
			env.IMAGES.text(fitCardText(item.name), {
				color: "#1b1d23",
				font,
				size: 64,
			}),
			{ left: 96, top: 336 }
		);
	}
	card = card.draw(
		env.IMAGES.text(describeDriveItem(item, childCount), {
			color: "#6b7080",
			font,
			size: 34,
		}),
		{ left: 96, top: 432 }
	);
	if (LATIN.test(appName)) {
		card = card.draw(
			env.IMAGES.text(fitCardText(appName, 40), {
				color: "#6b7080",
				font,
				size: 28,
			}),
			{ bottom: 64, right: 96 }
		);
	}
	const result = await card.output({ format: "image/png" });
	return result.response({ headers: CARD_HEADERS });
}

/**
 * The link preview image for a shared item: the photo itself, the video's first second with a play badge, or a card
 * naming the file. Each step falls back to a plainer one, ending at the kind's static card, so a crawler always gets
 * an image.
 */
export async function shareImageResponse(
	env: CloudflareEnv,
	request: Request,
	item: DriveRow,
	childCount: number,
	appName: string
): Promise<Response> {
	const { origin } = new URL(request.url);
	const kind = driveKindOf(item);
	const { IMAGES: images } = env;
	// Only types the content endpoint serves inline as images; SVG and anything unparsable get the card.
	const inlineImage = getInlineContentType(item.contentType)?.startsWith(
		"image/"
	);
	if (inlineImage) {
		const source =
			images && item.size <= IMAGES_INPUT_MAX_BYTES
				? await env.BUCKET.get(
						item.r2Key ?? driveObjectKey(item.ownerId, item.id)
					)
				: null;
		if (source) {
			try {
				return await stillImage(env, origin, await source.arrayBuffer(), false);
			} catch (error) {
				console.warn("Share image resize failed", error);
			}
		}
		// Unresized, the photo itself, through the endpoint that already serves it safely.
		if (item.size <= RAW_IMAGE_MAX_BYTES) {
			const content = new URL(request.url);
			content.search = "";
			content.searchParams.set("item", item.id);
			content.searchParams.set("content", "1");
			return Response.redirect(content.href, 302);
		}
	}
	if (kind === "video") {
		const poster = await readPoster(env, item);
		if (poster && images) {
			try {
				return await stillImage(env, origin, poster, true);
			} catch (error) {
				console.warn("Share video card failed", error);
			}
		}
		if (poster) {
			return new Response(poster, {
				headers: { ...CARD_HEADERS, "Content-Type": "image/jpeg" },
			});
		}
	}
	if (images) {
		try {
			return await nameCard(env, origin, item, childCount, appName);
		} catch (error) {
			console.warn("Share card failed", error);
		}
	}
	return Response.redirect(new URL(`/og/${kind}.png`, origin).href, 302);
}
