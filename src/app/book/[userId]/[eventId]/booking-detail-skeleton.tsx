"use client";
import { useLanguage } from "@/components/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn as scopeLayoutClasses } from "@/lib/utils";

export function BookingDetailSkeleton() {
	const { t } = useLanguage();
	return (
		<output
			aria-label={t("public.loadingAvailability")}
			className={scopeLayoutClasses(
				"grid overflow-hidden rounded-t-lg border border-b-0 bg-card shadow-sm lg:min-h-0 lg:flex-1",
				"lg:grid-cols-[minmax(240px,0.95fr)_minmax(380px,1.65fr)_minmax(240px,0.95fr)]"
			)}
		>
			<span className="sr-only">{t("public.loadingAvailabilityEllipsis")}</span>
			<div className="flex flex-col gap-6 border-b border-border p-7 sm:p-9 lg:border-r lg:border-b-0">
				<Skeleton className="h-6 w-2/3" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
				<Skeleton className="mt-10 h-4 w-1/3" />
			</div>
			<div className="border-b border-border p-7 sm:p-9 lg:border-r lg:border-b-0">
				<Skeleton className="h-6 w-1/2" />
				<div className="mx-auto mt-10 grid max-w-110 grid-cols-7 gap-2">
					{Array.from({ length: 35 }, (_, index) => (
						<Skeleton key={index} className="aspect-square rounded-full" />
					))}
				</div>
			</div>
			<div className="flex flex-col gap-3 p-7 sm:p-9">
				<Skeleton className="mb-6 h-6 w-3/4" />
				{[0, 1, 2, 3, 4].map((item) => (
					<Skeleton key={item} className="h-10" />
				))}
			</div>
		</output>
	);
}
