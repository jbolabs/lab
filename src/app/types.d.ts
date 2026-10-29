import type { TranslationKey } from "@/lib/i18n/types";
import type { LucideIcon } from "lucide-react";
import type { MailboxSelectorUser } from "@/components/mailbox-selector-types";

export type HomeAccountMenuProps = {
	user: MailboxSelectorUser;
};

export type QuickLink = {
	href: string;
	labelKey: TranslationKey;
	icon: LucideIcon;
	adminOnly?: boolean;
};
