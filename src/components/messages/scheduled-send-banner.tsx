"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { authFetch } from "@/lib/auth/client";
import { clearMessageDetailCache } from "@/lib/messages/detail-cache";
import { formatScheduledSendTime } from "./scheduled-send-utils";

/** Shown above a scheduled message; cancelling returns it to Drafts. */
export function ScheduledSendBanner({ messageId, scheduledAt }: { messageId: string; scheduledAt: string }) {
	const { t } = useLanguage();
	const router = useRouter();
	const [cancelling, setCancelling] = useState(false);

	async function cancelSend() {
		setCancelling(true);
		try {
			const response = await authFetch(`/api/messages/${messageId}/cancel-schedule`, { method: "POST" });
			if (!response.ok) throw new Error("Unable to cancel");
			clearMessageDetailCache();
			window.dispatchEvent(new Event("mailflare:messages-changed"));
			router.push("/drafts");
		} catch {
			toast.error(t("schedule.cancelFailed"));
			setCancelling(false);
		}
	}

	return (
		<div className="mx-6 mb-2 flex items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
			<CalendarClock className="h-5 w-5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1">{t("schedule.sendScheduledFor", { when: formatScheduledSendTime(scheduledAt, t) })}</span>
			<Button variant="outline" size="sm"
				type="button"
				onClick={() => void cancelSend()}
				disabled={cancelling}
				className="shrink-0 font-medium text-signal hover:underline disabled:opacity-50"
			>
				{t("schedule.cancelSend")}
			</Button>
		</div>
	);
}
