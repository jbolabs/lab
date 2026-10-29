"use client";
import { Skeleton } from "@/components/ui/skeleton";

import { useLanguage } from "@/components/language-provider";

export function BookingDetailSkeleton() {
	const { t } = useLanguage();
	return <div role="status" aria-label={t("public.loadingAvailability")} className="grid overflow-hidden rounded-t-3xl bg-card shadow-sm lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(240px,.95fr)_minmax(380px,1.65fr)_minmax(240px,.95fr)]">
		<span className="sr-only">{t("public.loadingAvailabilityEllipsis")}</span>
		<div className="flex flex-col gap-6 border-b border-border p-7 sm:p-9 lg:border-b-0 lg:border-r">
			<Skeleton className="h-6 w-2/3 rounded bg-accent" />
			<Skeleton className="h-4 w-full rounded bg-muted" />
			<Skeleton className="size-4/5 rounded bg-muted" />
			<Skeleton className="mt-10 h-4 w-1/3 rounded bg-muted" />
		</div>
		<div className="border-b border-border p-7 sm:p-9 lg:border-b-0 lg:border-r">
			<Skeleton className="h-6 w-1/2 rounded bg-accent" />
			<div className="mx-auto mt-10 grid max-w-[440px] grid-cols-7 gap-2">
				{Array.from({ length: 35 }, (_, index) => <div key={index} className="aspect-square rounded-lg bg-muted" />)}
			</div>
		</div>
		<div className="flex flex-col gap-3 p-7 sm:p-9">
			<Skeleton className="mb-6 h-6 w-3/4 rounded bg-accent" />
			{[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-11 rounded-md bg-muted" />)}
		</div>
	</div>;
}
