import type { Message } from "@/hooks/types";

export interface CachedMessageDetail {
	message?: Message;
	body?: { htmlBody: string | null; textBody: string | null } | null;
	attachments?: {
		contentId: string | null;
		disposition: "attachment" | "inline";
		filename: string;
		id: string;
		messageId: string;
		size: number;
		type: string;
	}[];
	unsubscribeUrl?: string | null;
	scheduledAt?: string | null;
	error?: string;
}
