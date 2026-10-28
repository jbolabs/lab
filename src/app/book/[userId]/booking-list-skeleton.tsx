"use client";
import { Skeleton } from "@/components/ui/skeleton";

import { useLanguage } from "@/components/language-provider";

export function BookingListSkeleton() {
	const { t } = useLanguage();
	return <div role="status" aria-label={t("public.loadingMeetings")} className="flex flex-col gap-3">
		<span className="sr-only">{t("public.loadingMeetingsEllipsis")}</span>
		{[0, 1, 2].map((item) => <div key={item} className="rounded-2xl bg-card p-5">
			<Skeleton className="h-5 w-2/3 rounded bg-accent" />
			<Skeleton className="mt-4 h-3 w-5/6 rounded bg-muted" />
			<Skeleton className="mt-3 h-3 w-1/3 rounded bg-muted" />
		</div>)}
	</div>;
}
