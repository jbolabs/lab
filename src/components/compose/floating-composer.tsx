"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MailPlus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ComposeForm } from "@/components/compose/compose-form";
import { useCompose } from "@/components/compose/compose-context";
import { useSidebar } from "@/components/sidebar-state";
import { useLanguage } from "@/components/language-provider";

/** `showButton` adds the phone Compose button; only the dashboard pages (mail) pass it. */
export function FloatingComposer({
	showButton = false,
}: {
	showButton?: boolean;
}) {
	const { open, draftId, openComposer, closeComposer, notice } = useCompose();
	const pathname = usePathname();
	const router = useRouter();
	const { t } = useLanguage();
	const { mobileOpen } = useSidebar();
	useEffect(() => {
		if (notice)
			toast.success(notice.message, {
				duration: notice.durationMs,
				action: notice.action
					? { label: notice.action.label, onClick: notice.action.onClick }
					: undefined,
			});
	}, [notice]);
	return (
		<>
			{showButton && !open && !mobileOpen && (
				<Button
					type="button"
					onClick={openComposer}
					aria-label={t("navigation.compose")}
					className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 min-h-12 rounded-full px-5 md:hidden"
				>
					<MailPlus data-icon="inline-start" />
					{t("navigation.compose")}
				</Button>
			)}
			{open && (
				<ComposeForm
					key={draftId ?? "new"}
					mode="popup"
					draftIdToLoad={draftId}
					onClose={() => {
						closeComposer();
						if (/^\/drafts\/[^/]+\/?$/.test(pathname))
							router.replace("/drafts");
					}}
				/>
			)}
		</>
	);
}
