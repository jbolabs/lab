"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { clearMessageDetailCache } from "@/lib/messages/detail-cache";
import { useRouter } from "@/lib/navigation";

import { formatScheduledSendTime } from "./scheduled-send-utils";

/** Shown above a scheduled message; cancelling returns it to Drafts. */
export function ScheduledSendBanner({
	messageId,
	scheduledAt,
}: {
	messageId: string;
	scheduledAt: string;
}) {
	const { t } = useLanguage();
	const router = useRouter();
	const [cancelling, setCancelling] = useState(false);

	async function cancelSend() {
		setCancelling(true);
		try {
			const response = await authFetch(
				`/api/messages/${messageId}/cancel-schedule`,
				{ method: "POST" }
			);
			requireSuccessfulResponse(response, "Unable to cancel");
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
			<CalendarClock className="size-5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1">
				{t("schedule.sendScheduledFor", {
					when: formatScheduledSendTime(scheduledAt, t),
				})}
			</span>
			<Button
				variant="link"
				size="none"
				type="button"
				onClick={() => cancelSend()}
				disabled={cancelling}
				className="shrink-0"
			>
				{t("schedule.cancelSend")}
			</Button>
		</div>
	);
}
