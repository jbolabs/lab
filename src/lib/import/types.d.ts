export interface ImportMailboxResult {
	imported: number;
	skipped: number;
	errors: string[];
}

export interface ImportMessageInput {
	filename: string;
	raw: ArrayBuffer;
}
