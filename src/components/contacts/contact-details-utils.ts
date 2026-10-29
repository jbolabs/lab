import { authFetch } from "@/lib/auth/client";
import { getEmailAddress } from "@/lib/email/address";

import type {
	ContactDetailsRecord,
	ContactDetailsResponse,
} from "./contact-details-types";

export async function fetchContactDetails(
	mailboxId: string,
	address: string
): Promise<ContactDetailsRecord> {
	const params = new URLSearchParams({
		address: getEmailAddress(address),
		mailboxId,
	});
	const response = await authFetch(`/api/contacts?${params.toString()}`);
	const data = (await response.json()) as ContactDetailsResponse;
	if (!response.ok || !data.contact) {
		throw new Error(data.error ?? "Unable to load contact");
	}
	return data.contact;
}

export async function updateContactName(
	mailboxId: string,
	address: string,
	displayName: string
): Promise<ContactDetailsRecord> {
	const response = await authFetch("/api/contacts", {
		body: JSON.stringify({
			address: getEmailAddress(address),
			displayName,
			mailboxId,
		}),
		headers: { "Content-Type": "application/json" },
		method: "PATCH",
	});
	const data = (await response.json()) as ContactDetailsResponse;
	if (!response.ok || !data.contact) {
		throw new Error(data.error ?? "Unable to update contact");
	}
	return data.contact;
}

export function getContactInitial(name: string, address: string): string {
	return (name.trim() || getEmailAddress(address)).slice(0, 1).toUpperCase();
}
