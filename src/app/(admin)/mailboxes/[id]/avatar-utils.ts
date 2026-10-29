import { clearMailboxesCache } from "@/components/mailbox-provider-utils";
import { validateProfileAvatar } from "@/components/settings/profile-avatar-form-utils";
import { authFetch } from "@/lib/auth/client";
import { appendOptimizedAvatar } from "@/lib/avatar-upload-client";

import type { MailboxAvatarUploadResponse } from "./types";

export { PROFILE_AVATAR_ACCEPT as MAILBOX_AVATAR_ACCEPT } from "@/components/settings/profile-avatar-form-utils";

export function getMailboxAvatarUrl(mailboxId: string): string {
	return `/api/mailboxes/${mailboxId}/avatar?v=${Date.now()}`;
}

export function validateMailboxAvatar(file: File): string | null {
	return validateProfileAvatar(file);
}

export async function uploadMailboxAvatar(
	mailboxId: string,
	file: File
): Promise<void> {
	const body = new FormData();
	await appendOptimizedAvatar(body, file);
	const response = await authFetch(`/api/mailboxes/${mailboxId}/avatar`, {
		body,
		method: "POST",
	});
	if (response.ok) {
		clearMailboxesCache();
		return;
	}

	const data = (await response
		.json()
		.catch(() => null)) as MailboxAvatarUploadResponse | null;
	throw new Error(data?.error ?? "Upload failed");
}
