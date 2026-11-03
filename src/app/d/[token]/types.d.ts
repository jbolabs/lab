import type { publicShare } from "@/lib/route-data";

export type {
	PublicDriveItem,
	PublicDriveListing,
} from "@/lib/drive/public-listing";

export type PublicShare = Awaited<ReturnType<typeof publicShare>>;
