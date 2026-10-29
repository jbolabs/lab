"use client";
import { useLanguage } from "@/components/language-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function BookingListSkeleton() {
	const { t } = useLanguage();
	return (
		<output aria-label={t("booking.loading")} className="flex flex-col gap-3">
			<span className="sr-only">{t("booking.loadingEllipsis")}</span>
			{[0, 1, 2].map((item) => (
				<div key={item} className="flex flex-col rounded-lg border bg-card p-5">
					<Skeleton className="h-5 w-1/2" />
					<Skeleton className="mt-4 h-4 w-3/4" />
					<Skeleton className="mt-3 h-3 w-2/5" />
				</div>
			))}
		</output>
	);
}
