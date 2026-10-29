export type DriveUploadStatus = "queued" | "uploading" | "done" | "failed";

export interface DriveUploadEntry {
	id: string;
	name: string;
	percent: number;
	resumed: boolean;
	status: DriveUploadStatus;
	error?: string;
}
