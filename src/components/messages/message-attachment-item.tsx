"use client";

import { Play } from "lucide-react";

import { formatAttachmentSize } from "@/app/(dashboard)/inbox/[messageId]/utils";
import { AttachmentImage } from "@/components/attachment-image";
import { useLanguage } from "@/components/language-provider";
import type { MessageAttachmentCardProps } from "@/components/message-attachment-card-types";
import { getAttachmentVisual } from "@/components/message-attachment-card-utils";
import { getAttachmentFileUrl } from "@/components/message-attachment-viewer-utils";
import { Button } from "@/components/ui/button";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";

export function MessageAttachmentItem({
	attachment,
	messageId,
	onPreview,
}: MessageAttachmentCardProps) {
	const { t } = useLanguage();
	const visual = getAttachmentVisual(attachment);
	const Icon = visual.icon;
	const url = getAttachmentFileUrl(messageId, attachment.id, "preview");
	const renderThumbnail = () => {
		if (visual.thumbnail === "image") {
			return (
				<AttachmentImage
					src={url}
					alt=""
					loading="lazy"
					className="object-cover"
				/>
			);
		}
		return visual.thumbnail === "video" ? (
			<span className="relative size-10">
				<video
					src={url}
					muted
					preload="metadata"
					playsInline
					className="size-full object-cover"
				/>
				<Play className="absolute inset-3 size-4 fill-current" />
			</span>
		) : (
			<Icon />
		);
	};
	return (
		<Item variant="outline" size="sm" asChild>
			<Button
				type="button"
				variant="plain"
				size="none"
				className="w-full"
				onClick={() => onPreview(attachment)}
			>
				<ItemMedia variant={visual.thumbnail ? "image" : "icon"}>
					{renderThumbnail()}
				</ItemMedia>
				<ItemContent className="min-w-0">
					<ItemTitle className="max-w-full">
						<span className="truncate">{attachment.filename}</span>
					</ItemTitle>
					<ItemDescription>
						{t(visual.labelKey)} · {formatAttachmentSize(attachment.size)}
					</ItemDescription>
				</ItemContent>
			</Button>
		</Item>
	);
}
