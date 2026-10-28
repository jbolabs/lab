"use client";
import { Skeleton } from "@/components/ui/skeleton";

import { useLanguage } from "@/components/language-provider";

export function BookingListSkeleton() {
	const { t } = useLanguage();
	return <div role="status" aria-label={t("booking.loading")} className="flex flex-col gap-3">
		<span className="sr-only">{t("booking.loadingEllipsis")}</span>
		{[0, 1, 2].map((item) => <div key={item} className="rounded-2xl border border-border bg-card px-5 py-5">
			<Skeleton className="h-5 w-1/2 rounded bg-accent" />
			<Skeleton className="mt-4 size-3/4 rounded bg-muted" />
			<Skeleton className="mt-3 h-3 w-2/5 rounded bg-muted" />
		</div>)}
	</div>;
}
