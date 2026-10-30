"use client";

import { ArrowDownToLine, FileWarning } from "lucide-react";
import { useEffect, useState } from "react";

import { AttachmentImage } from "@/components/attachment-image";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

import type { MessageAttachmentViewerProps } from "./message-attachment-viewer-types";
import {
	getAttachmentFileUrl,
	getAttachmentPreviewKind,
} from "./message-attachment-viewer-utils";

export function MessageAttachmentViewer({
	attachment,
	messageId,
	onOpenChange,
	open,
}: MessageAttachmentViewerProps) {
	const { t } = useLanguage();
	const [textContent, setTextContent] = useState("");
	const [textError, setTextError] = useState("");
	const identity = `${messageId}:${attachment?.id ?? ""}:${open}`;
	const [previousIdentity, setPreviousIdentity] = useState(identity);
	if (previousIdentity !== identity) {
		setPreviousIdentity(identity);
		setTextContent("");
		setTextError("");
	}

	const previewKind = attachment
		? getAttachmentPreviewKind(attachment)
		: "unsupported";
	const previewUrl = attachment
		? getAttachmentFileUrl(messageId, attachment.id, "preview")
		: "";
	const downloadUrl = attachment
		? getAttachmentFileUrl(messageId, attachment.id, "download")
		: "";

	useEffect(() => {
		if (!open || !attachment || previewKind !== "text") {
			return;
		}
		let cancelled = false;

		async function loadText() {
			try {
				const response = await authFetch(previewUrl);
				requireSuccessfulResponse(response, t("attachment.loadFailed"));
				const content = await response.text();
				if (!cancelled) {
					setTextContent(content);
				}
			} catch (error) {
				if (!cancelled) {
					setTextError(
						error instanceof Error ? error.message : t("attachment.loadFailed")
					);
				}
			}
		}
		void loadText();

		return () => {
			cancelled = true;
		};
	}, [attachment, open, previewKind, previewUrl, t]);

	if (!attachment) {
		return null;
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(88vh,900px)] w-[min(1100px,calc(100vw-32px))] flex-col overflow-hidden">
				<DialogHeader className="shrink-0">
					<DialogTitle>{attachment.filename}</DialogTitle>
					<DialogDescription>{attachment.type}</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-muted">
					{previewKind === "image" && (
						<AttachmentImage
							src={previewUrl}
							alt={attachment.filename}
							className="max-h-full max-w-full object-contain"
						/>
					)}
					{previewKind === "pdf" && (
						<>
							{/* oxlint-disable-next-line react/iframe-missing-sandbox -- Chromium's native PDF viewer fails in sandboxed frames; this branch only embeds application/pdf attachments. */}
							<iframe
								src={previewUrl}
								title={attachment.filename}
								className="h-full w-full border-0 bg-card"
							/>
						</>
					)}
					{previewKind === "audio" && (
						<>
							{/* oxlint-disable-next-line jsx-a11y/media-has-caption -- User-uploaded mail attachments have no caption track available. */}
							<audio src={previewUrl} controls className="w-[min(560px,90%)]" />
						</>
					)}
					{previewKind === "video" && (
						<>
							{/* oxlint-disable-next-line jsx-a11y/media-has-caption -- User-uploaded mail attachments have no caption track available. */}
							<video
								src={previewUrl}
								controls
								className="max-h-full max-w-full"
							/>
						</>
					)}
					{previewKind === "text" &&
						(textError || textContent ? (
							<pre className="h-full w-full overflow-auto p-5 text-sm whitespace-pre-wrap text-foreground">
								{textError || textContent}
							</pre>
						) : (
							<div className="flex h-full w-full flex-col gap-3 bg-card p-5">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-11/12" />
								<Skeleton className="size-4/5" />
							</div>
						))}
					{previewKind === "unsupported" && (
						<div className="flex flex-col items-center gap-3 px-6 text-center">
							<FileWarning className="size-10 text-muted-foreground/70" />
							<p className="text-sm text-muted-foreground">
								{t("attachment.unsupported")}
							</p>
						</div>
					)}
				</div>

				<div className="flex shrink-0 justify-end">
					<Button
						// oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI render: the text is this component's children.
						render={<a href={downloadUrl} download={attachment.filename} />}
						nativeButton={false}
					>
						<ArrowDownToLine className="size-4" />
						{t("attachment.download")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
