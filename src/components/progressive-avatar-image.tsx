"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { cn } from "@/lib/utils";

import type { ProgressiveAvatarImageProps } from "./progressive-avatar-image-types";
import { getAvatarPreviewUrl } from "./progressive-avatar-image-utils";

export function ProgressiveAvatarImage({
	src,
	alt,
	className,
	onError,
}: ProgressiveAvatarImageProps) {
	const [previewReadyFor, setPreviewReadyFor] = useState<string | null>(null);
	const [previewFailedFor, setPreviewFailedFor] = useState<string | null>(null);
	const [fullReadyFor, setFullReadyFor] = useState<string | null>(null);
	const [failedFor, setFailedFor] = useState<string | null>(null);
	const reportError = useEffectEvent(() => onError?.());
	const showFull = previewFailedFor === src || fullReadyFor === src;
	const imageRef = useCallback(
		(image: HTMLImageElement | null) => {
			if (!image?.complete) {
				return;
			}
			if (image.naturalWidth > 0) {
				setPreviewReadyFor(src);
			} else {
				setPreviewFailedFor(src);
			}
		},
		[src]
	);

	useEffect(() => {
		if (previewReadyFor !== src) {
			return;
		}
		let cancelled = false;
		const image = new Image();
		const handleLoad = () => {
			if (!cancelled) {
				setFullReadyFor(src);
			}
		};
		const handleError = () => {
			if (!cancelled) {
				setFailedFor(src);
				reportError();
			}
		};
		image.addEventListener("load", handleLoad);
		image.addEventListener("error", handleError);
		image.src = src;
		return () => {
			cancelled = true;
			image.removeEventListener("load", handleLoad);
			image.removeEventListener("error", handleError);
		};
	}, [previewReadyFor, src]);

	if (failedFor === src) {
		return null;
	}

	return (
		<img
			ref={imageRef}
			src={showFull ? src : getAvatarPreviewUrl(src)}
			alt={alt}
			className={cn(!showFull && "blur-xs", className)}
			onLoad={() => {
				if (!showFull) {
					setPreviewReadyFor(src);
				}
			}}
			onError={() => {
				if (showFull) {
					setFailedFor(src);
					onError?.();
				} else {
					setPreviewFailedFor(src);
				}
			}}
		/>
	);
}
