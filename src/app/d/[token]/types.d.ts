export interface PublicDriveItem {
	id: string;
	kind: "file" | "folder";
	name: string;
	size: number;
	contentType: string;
	updatedAt: string;
}
export interface PublicDriveListing {
	item: PublicDriveItem;
	items: PublicDriveItem[];
	path: { id: string; name: string }[];
}
