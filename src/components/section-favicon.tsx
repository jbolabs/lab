"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setSectionFavicon } from "@/lib/section-icons";

export function SectionFavicon() {
	const pathname = usePathname();
	useEffect(() => { setSectionFavicon(document, pathname); }, [pathname]);
	return null;
}
