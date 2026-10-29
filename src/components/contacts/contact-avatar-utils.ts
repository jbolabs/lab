import { getEmailAddress } from "@/lib/email/address";

export function getManagedContactAvatarUrl(
	mailboxId: string,
	address: string,
	version = 0
): string {
	const params = new URLSearchParams({
		address: getEmailAddress(address),
		mailboxId,
	});
	if (version) {
		params.set("v", String(version));
	}
	return `/api/contacts/avatar?${params.toString()}`;
}

export function getContactAvatarInitial(name: string, address: string): string {
	return (name.trim() || getEmailAddress(address)).slice(0, 1).toUpperCase();
}
