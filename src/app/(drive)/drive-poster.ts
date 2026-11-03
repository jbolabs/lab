import { authFetch } from "@/lib/auth/client";
import type { DriveItemDto } from "@/lib/drive/types";

import { contentUrl } from "./drive-utils";

const POSTER_WIDTH = 1280;

/** Grabs one frame, about a second in, from a video the browser can already play. */
export function captureVideoFrame(src: string): Promise<Blob | null> {
	const { promise, resolve } = Promise.withResolvers<Blob | null>();
	const video = document.createElement("video");
	// A video that never seeks gives up the same way a broken one does.
	const timer = setTimeout(
		() => video.dispatchEvent(new Event("error")),
		20_000
	);
	const finish = (blob: Blob | null) => {
		clearTimeout(timer);
		video.removeAttribute("src");
		video.load();
		resolve(blob);
	};
	video.muted = true;
	video.playsInline = true;
	video.preload = "auto";
	video.addEventListener("error", () => finish(null), { once: true });
	video.addEventListener(
		"loadedmetadata",
		() => {
			video.currentTime = Math.min(1, video.duration / 2 || 0);
		},
		{ once: true }
	);
	video.addEventListener(
		"seeked",
		() => {
			const scale = Math.min(1, POSTER_WIDTH / (video.videoWidth || 1));
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(video.videoWidth * scale);
			canvas.height = Math.round(video.videoHeight * scale);
			const context = canvas.getContext("2d");
			if (!context || !canvas.width || !canvas.height) {
				return finish(null);
			}
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(finish, "image/jpeg", 0.85);
		},
		{ once: true }
	);
	video.src = src;
	return promise;
}

/**
 * Gives a shared video a poster frame for its link preview, captured here because the server can only pull frames
 * from smaller videos. Runs once per video: a stored poster is left alone.
 */
export async function ensureVideoPoster(
	item: Pick<DriveItemDto, "id" | "contentType" | "source">
): Promise<void> {
	if (item.source || !item.contentType.startsWith("video/")) {
		return;
	}
	const url = `/api/drive/items/${encodeURIComponent(item.id)}/poster`;
	const existing = await authFetch(url, { redirectOnUnauthorized: false });
	if (existing.ok || existing.status !== 404) {
		return;
	}
	const frame = await captureVideoFrame(contentUrl(item.id));
	if (frame) {
		await authFetch(url, {
			body: frame,
			headers: { "Content-Type": "image/jpeg" },
			method: "PUT",
			redirectOnUnauthorized: false,
		});
	}
}
