import type { TranslationKey } from "@/lib/i18n/types";
import type { LucideIcon } from "lucide-react";
import type { ButtonProps } from "@/components/ui/button";
import type { MailboxSelectorUser } from "@/components/mailbox-selector-types";
import type { ReactNode } from "react";

export type HomeAuthProviderProps = {
	children: ReactNode;
};

export type HomeAuthResponse = {
	user?: MailboxSelectorUser;
};

export type HomeAccountMenuProps = {
	user: MailboxSelectorUser;
};

export type HomeAction = {
	href: string;
	labelKey: TranslationKey;
	variant: ButtonProps["variant"];
};

export type SidebarItem = {
	labelKey: TranslationKey;
	icon: LucideIcon;
	active?: boolean;
	count?: string;
};

export type MailPreview = {
	sender: string;
	subject: string;
	preview: string;
	time: string;
	unread?: boolean;
};
