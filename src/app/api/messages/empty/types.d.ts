import type { PermanentDeleteFolder } from "../bulk/types";

export interface EmptyFolderPayload {
	mailboxId?: string;
	folder?: PermanentDeleteFolder;
}

export interface EmptyFolderResponse {
	ok?: boolean;
	deleted?: number;
	remaining?: number;
	error?: string;
}
