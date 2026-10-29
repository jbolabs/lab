import type { LucideIcon } from "lucide-react";

import type { MailboxSelectorUser } from "@/components/mailbox-selector-types";
import type { TranslationKey } from "@/lib/i18n/types";

export interface HomeAccountMenuProps {
	user: MailboxSelectorUser;
}

export interface QuickLink {
	href: string;
	labelKey: TranslationKey;
	icon: LucideIcon;
	adminOnly?: boolean;
}
