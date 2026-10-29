import type { driveItems } from "@/db/schema";

export type DriveRow = typeof driveItems.$inferSelect;
export type DriveRole = "owner" | "edit" | "view";
export type DriveShareRole = "view" | "edit";

export interface DriveItemDto {
	id: string;
	kind: "file" | "folder";
	name: string;
	size: number;
	contentType: string;
	parentId: string | null;
	ownerId: string;
	ownerName: string;
	ownerHasAvatar: boolean;
	role: DriveRole;
	shared: boolean;
	linkToken: string | null;
	trashedAt: string | null;
	updatedAt: string;
	/** Set for files that come from an email rather than from Drive. */
	source?: {
		messageId: string;
		subject: string;
		direction: "inbound" | "outbound";
		canDelete: boolean;
	};
}

export interface DriveCrumb {
	id: string;
	name: string;
}

export interface DriveShareDto {
	id: string;
	userId: string;
	name: string;
	email: string;
	role: DriveShareRole;
}
