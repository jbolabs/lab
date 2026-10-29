"use client";

import { ArrowDownToLine, Play } from "lucide-react";

import { formatAttachmentSize } from "@/app/(dashboard)/inbox/[messageId]/utils";
import { AttachmentImage } from "@/components/attachment-image";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

import type { MessageAttachmentCardProps } from "./message-attachment-card-types";
import { getAttachmentVisual } from "./message-attachment-card-utils";
import { getAttachmentFileUrl } from "./message-attachment-viewer-utils";

export function MessageAttachmentCard({
	attachment,
	messageId,
	onPreview,
}: MessageAttachmentCardProps) {
	const { t } = useLanguage();
	const visual = getAttachmentVisual(attachment);
	const Icon = visual.icon;
	const previewUrl = getAttachmentFileUrl(messageId, attachment.id, "preview");

	return (
		<Button
			type="button"
			variant="outline"
			onClick={() => onPreview(attachment)}
			className="group w-full justify-start text-left whitespace-normal"
		>
			{visual.thumbnail === "image" && (
				<AttachmentImage
					src={previewUrl}
					alt=""
					loading="lazy"
					className="size-14 shrink-0 rounded-md bg-muted object-cover"
				/>
			)}
			{visual.thumbnail === "video" && (
				<span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-primary">
					<video
						src={previewUrl}
						muted
						preload="metadata"
						playsInline
						className="h-full w-full object-cover"
					/>
					<span className="absolute inset-0 flex items-center justify-center bg-black/20">
						<Play className="size-5 fill-white text-white" />
					</span>
				</span>
			)}
			{visual.thumbnail === null && (
				<span
					className={`flex size-14 shrink-0 items-center justify-center rounded-md ${visual.iconClassName}`}
				>
					<Icon className="size-6" />
				</span>
			)}
			<span className="min-w-0 flex-1 text-left">
				<span className="block truncate text-sm font-medium text-foreground">
					{attachment.filename}
				</span>
				<span className="mt-0.5 block truncate text-xs text-muted-foreground">
					{t(visual.labelKey)} · {formatAttachmentSize(attachment.size)}
				</span>
			</span>
			<ArrowDownToLine className="size-4 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-signal" />
		</Button>
	);
}
