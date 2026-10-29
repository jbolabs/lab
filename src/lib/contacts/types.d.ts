import type { contacts } from "@/db/schema";
import type { ContactSource } from "@/lib/email/address-types";

export type ContactRow = typeof contacts.$inferSelect;

export interface ContactInput {
	userId: string;
	address: string;
	source: ContactSource;
}

export interface BlockContactInput {
	userId: string;
	mailboxId: string;
	domainId: string;
	address: string;
}

export interface MessageContactNames {
	fromContactName: string | null;
	toContactName: string | null;
}
