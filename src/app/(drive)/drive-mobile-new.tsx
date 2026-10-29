"use client";

import { FilePlus2, FolderPlus, Plus, UploadCloud } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";

import {
	DRIVE_LOCATION_EVENT,
	DRIVE_NEW_FOLDER_EVENT,
	DRIVE_UPLOAD_EVENT,
} from "./drive-events";
import type { DriveLocationDetail } from "./drive-events";

/** Phones: a "New" button in thumb reach that opens a bottom sheet, like Compose in mail. */
export function DriveMobileNew() {
	const { t } = useLanguage();
	const pathname = usePathname();
	const params = useSearchParams();
	const [open, setOpen] = useState(false);
	const [location, setLocation] = useState<DriveLocationDetail | null>(null);
	useEffect(() => {
		const onLocation = (event: Event) =>
			setLocation((event as CustomEvent<DriveLocationDetail>).detail);
		window.addEventListener(DRIVE_LOCATION_EVENT, onLocation);
		return () => window.removeEventListener(DRIVE_LOCATION_EVENT, onLocation);
	}, []);
	const view = params.get("view") ?? "my";
	if (pathname !== "/drive" || view === "trash") {
		return null;
	}
	// Same rule as the sidebar's New menu: a document goes in the open folder once it is known to be writable.
	const folder = params.get("folder");
	const documentHref = (() => {
		if (folder) {
			if (location?.folderId === folder && location.canWrite) {
				return `/drive/document?parent=${encodeURIComponent(folder)}`;
			}
			return null;
		}
		return "/drive/document";
	})();

	function run(event: string) {
		setOpen(false);
		window.dispatchEvent(new Event(event));
	}

	const action = "w-full justify-start ";
	return (
		<>
			<Button
				type="button"
				onClick={() => setOpen(true)}
				float="mobile-end"
				className="md:hidden"
			>
				<Plus data-icon="inline-start" />
				{t("drive.new")}
			</Button>
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent className="">
					<DrawerHeader>
						<DrawerTitle>{t("drive.new")}</DrawerTitle>
					</DrawerHeader>
					<div className="flex flex-col gap-1 px-2 pb-4">
						<Button
							variant="ghost"
							size="lg"
							className={action}
							onClick={() => run(DRIVE_UPLOAD_EVENT)}
						>
							<UploadCloud data-icon="inline-start" />
							{t("drive.fileUpload")}
						</Button>
						<Button
							variant="ghost"
							size="lg"
							className={action}
							onClick={() => run(DRIVE_NEW_FOLDER_EVENT)}
						>
							<FolderPlus data-icon="inline-start" />
							{t("drive.newFolder")}
						</Button>
						{documentHref && (
							<Button variant="ghost" size="lg" className={action} asChild>
								<Link href={documentHref} onClick={() => setOpen(false)}>
									<FilePlus2 data-icon="inline-start" />
									{t("docs.create")}
								</Link>
							</Button>
						)}
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
