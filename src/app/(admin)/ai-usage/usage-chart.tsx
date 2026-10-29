import { useLanguage } from "@/components/language-provider";
import { getUserTimeZone } from "@/lib/time/utils";

import type { UsageChartProps } from "./types";
import { fillDailyUsage, formatDailyLabel, formatTokenCount } from "./utils";

export function UsageChart({
	daily,
	timeZone = getUserTimeZone(),
}: UsageChartProps) {
	const { t } = useLanguage();
	const days = daily.length ? daily : fillDailyUsage([], timeZone);
	const maxTokens = Math.max(
		0,
		...days.map((day) => day.inputTokens + day.outputTokens)
	);

	return (
		<section className="rounded-lg bg-card p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-base font-semibold text-foreground">
						{t("aiUsage.byDay")}
					</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("aiUsage.chartHint", { zone: timeZone })}
					</p>
				</div>
				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="size-2.5 rounded-sm bg-primary" />{" "}
						{t("aiUsage.legendInput")}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="size-2.5 rounded-sm bg-chart-1" />{" "}
						{t("aiUsage.legendOutput")}
					</span>
				</div>
			</div>
			<div
				className="mt-5 flex gap-3"

				aria-label={t("aiUsage.chartLabel")}
			>
				<div className="flex h-48 flex-col justify-between pb-5 text-right text-xs text-muted-foreground">
					<span>{formatTokenCount(maxTokens)}</span>
					<span>0</span>
				</div>
				<div className="flex min-w-0 flex-1 items-end gap-1 border-b border-border">
					{days.map((day, index) => {
						const total = day.inputTokens + day.outputTokens;
						return (
							<div
								key={day.date}
								className="flex h-48 min-w-0 flex-1 flex-col items-center"
								title={t("aiUsage.barTitle", {
									day: formatDailyLabel(day.date),
									requests: formatTokenCount(day.requests),
									tokens: formatTokenCount(total),
								})}
							>
								<div className="flex h-[172px] w-full items-end justify-center">
									<svg
										className="h-full w-full max-w-5"
										viewBox="0 0 20 100"
										preserveAspectRatio="none"
										aria-hidden="true"
									>
										<rect
											className="fill-primary"
											x="0"
											y={
												100 -
												(total
													? (Math.max(2, (total / maxTokens) * 100) *
															day.inputTokens) /
														total
													: 0)
											}
											width="20"
											height={
												total
													? (Math.max(2, (total / maxTokens) * 100) *
															day.inputTokens) /
														total
													: 0
											}
										/>
										<rect
											className="fill-chart-1"
											x="0"
											y={
												100 -
												(total ? Math.max(2, (total / maxTokens) * 100) : 0)
											}
											width="20"
											height={
												total
													? (Math.max(2, (total / maxTokens) * 100) *
															day.outputTokens) /
														total
													: 0
											}
										/>
									</svg>
								</div>
								<span className="h-5 pt-1 text-xs whitespace-nowrap text-muted-foreground">
									{index % 5 === 0 || index === days.length - 1
										? formatDailyLabel(day.date)
										: ""}
								</span>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
