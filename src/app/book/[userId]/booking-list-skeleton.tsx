"use client";
import { useLanguage } from "@/components/language-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function BookingListSkeleton() {
	const { t } = useLanguage();
	return (
		<output
			aria-label={t("public.loadingMeetings")}
			className="flex flex-col gap-3"
		>
			<span className="sr-only">{t("public.loadingMeetingsEllipsis")}</span>
			{[0, 1, 2].map((item) => (
				<div
					key={item}
					className="flex flex-col rounded-lg border bg-card p-5 shadow-sm"
				>
					<Skeleton className="h-5 w-2/3" />
					<Skeleton className="mt-4 h-3 w-5/6" />
					<Skeleton className="mt-3 h-3 w-1/3" />
				</div>
			))}
		</output>
	);
}
