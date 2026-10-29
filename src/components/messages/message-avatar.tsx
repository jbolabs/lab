"use client";

import { ContactAvatarImage } from "@/components/contacts/contact-avatar-image";
import type { ContactAvatarProps } from "@/components/contacts/contact-avatar-types";
import { getContactAvatarInitial } from "@/components/contacts/contact-avatar-utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function MessageAvatar({
	name,
	className,
	...imageProps
}: ContactAvatarProps) {
	return (
		<Avatar className={className} aria-hidden>
			<AvatarFallback>
				{getContactAvatarInitial(name, imageProps.address)}
			</AvatarFallback>
			<ContactAvatarImage
				key={JSON.stringify([
					imageProps.address,
					imageProps.hasManagedAvatar,
					imageProps.mailboxId,
					imageProps.managedAvatarUrl,
				])}
				{...imageProps}
			/>
		</Avatar>
	);
}
