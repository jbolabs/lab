import type { LucideIcon } from "lucide-react";

import type { MessageAttachment } from "@/app/(dashboard)/inbox/[messageId]/types";
import type { TranslationKey } from "@/lib/i18n/types";

export interface MessageAttachmentCardProps {
	attachment: MessageAttachment;
	messageId: string;
	onPreview: (attachment: MessageAttachment) => void;
}

export interface AttachmentVisual {
	icon: LucideIcon;
	iconClassName: string;
	labelKey: TranslationKey;
	thumbnail: "image" | "video" | null;
}
