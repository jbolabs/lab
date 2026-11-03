"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";

import { canPreview } from "./drive-utils";

/**
 * A video as large as its box allows at its own shape. Sizing it from its aspect ratio (rather than its intrinsic
 * size) keeps it from starting as a 300×150 box, and keeps the native play button on the picture.
 */
function VideoPreview({ src, poster }: { src: string; poster?: string }) {
	const [aspect, setAspect] = useState(16 / 9);
	// The poster usually arrives before the video's metadata, so it sets the shape first.
	useEffect(() => {
		if (!poster) {
			return;
		}
		const image = new Image();
		image.addEventListener("load", () => {
			if (image.naturalWidth && image.naturalHeight) {
				setAspect(image.naturalWidth / image.naturalHeight);
			}
		});
		image.src = poster;
	}, [poster]);
	return (
		<div className="[container-type:size] flex size-full items-center justify-center">
			{/* oxlint-disable-next-line jsx-a11y/media-has-caption -- User uploads have no caption track; preserve native media controls. */}
			<video
				// Without a poster, the fragment makes Safari paint the first frame instead of a black box.
				src={poster ? src : `${src}#t=0.001`}
				poster={poster}
				controls
				playsInline
				preload="metadata"
				onLoadedMetadata={(event) => {
					const { videoWidth, videoHeight } = event.currentTarget;
					if (videoWidth && videoHeight) {
						setAspect(videoWidth / videoHeight);
					}
				}}
				style={{ "--aspect": aspect } as React.CSSProperties}
				className="aspect-(--aspect) w-[min(100cqw,calc(var(--aspect)*100cqh))] rounded-lg"
			/>
		</div>
	);
}

export function DrivePreviewBody({
	src,
	downloadHref,
	contentType,
	name,
	poster,
}: {
	src: string;
	downloadHref: string;
	contentType: string;
	name: string;
	poster?: string;
}) {
	const { t } = useLanguage();
	if (!canPreview(contentType)) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-primary-foreground">
				<p>{t("drive.noPreview")}</p>
				<a
					href={downloadHref}
					className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-medium text-foreground"
				>
					<Download size={16} />
					{t("drive.download")}
				</a>
			</div>
		);
	}
	// Media sits centred in whatever box it is given and keeps its own shape, so native controls line up with it.
	if (contentType.startsWith("image/")) {
		return (
			<div className="flex size-full items-center justify-center">
				<img
					src={src}
					alt={name}
					className="max-h-full max-w-full rounded-lg object-contain"
				/>
			</div>
		);
	}
	if (contentType.startsWith("video/")) {
		return <VideoPreview src={src} poster={poster} />;
	}
	if (contentType.startsWith("audio/")) {
		return (
			<div className="flex h-full items-center justify-center">
				{/* oxlint-disable-next-line jsx-a11y/media-has-caption -- User uploads have no caption track; preserve native media controls. */}
				<audio src={src} controls />
			</div>
		);
	}
	return (
		<iframe
			sandbox="allow-same-origin"
			src={src}
			title={name}
			className="h-full w-full rounded-lg bg-background scheme-light"
		/>
	);
}
