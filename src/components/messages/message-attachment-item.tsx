"use client";

import { Play } from "lucide-react";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { formatAttachmentSize } from "@/app/(dashboard)/inbox/[messageId]/utils";
import { useLanguage } from "@/components/language-provider";
import type { MessageAttachmentCardProps } from "@/components/message-attachment-card-types";
import { getAttachmentFileUrl } from "@/components/message-attachment-viewer-utils";
import { getAttachmentVisual } from "@/components/message-attachment-card-utils";

export function MessageAttachmentItem({ attachment, messageId, onPreview }: MessageAttachmentCardProps) {
	const { t } = useLanguage();
	const visual = getAttachmentVisual(attachment);
	const Icon = visual.icon;
	const url = getAttachmentFileUrl(messageId, attachment.id, "preview");
	return <Item variant="outline" size="sm" asChild>
		<button type="button" className="w-full text-left" onClick={() => onPreview(attachment)}>
			<ItemMedia variant={visual.thumbnail ? "image" : "icon"}>
				{visual.thumbnail === "image" ? <img src={url} alt="" loading="lazy" className="object-cover" /> : visual.thumbnail === "video" ? <span className="relative size-10"><video src={url} muted preload="metadata" playsInline className="size-full object-cover" /><Play className="absolute inset-3 size-4 fill-current" /></span> : <Icon />}
			</ItemMedia>
			<ItemContent className="min-w-0"><ItemTitle className="max-w-full"><span className="truncate">{attachment.filename}</span></ItemTitle><ItemDescription>{t(visual.labelKey)} · {formatAttachmentSize(attachment.size)}</ItemDescription></ItemContent>
		</button>
	</Item>;
}
