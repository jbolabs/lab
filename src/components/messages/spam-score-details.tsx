import { useLanguage } from "@/components/language-provider";

import type { SpamScoreDetailsProps } from "./spam-score-details-types";
import { parseSpamSignals } from "./spam-score-details-utils";

export function SpamScoreDetails({
	score,
	verdict,
	signals,
	analysisError,
}: SpamScoreDetailsProps) {
	const { t } = useLanguage();
	if ((score === null || score === undefined) && !analysisError) {
		return null;
	}
	const parsedSignals = parseSpamSignals(signals);
	const renderAnalysis = () => {
		if (analysisError) {
			return (
				<p className="mt-2 text-sm text-muted-foreground">
					{t("message.spam.failed")}
				</p>
			);
		}
		return parsedSignals.length > 0 ? (
			<div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
				<p className="font-medium text-foreground">{t("message.spam.why")}</p>
				{parsedSignals.map((signal) => (
					<p key={signal.id}>
						<span
							className={signal.score > 0 ? "text-destructive" : "text-success"}
						>
							{signal.score > 0 ? "+" : ""}
							{signal.score}
						</span>{" "}
						{signal.reason}
					</p>
				))}
			</div>
		) : (
			<p className="mt-2 text-sm text-muted-foreground">
				{t("message.spam.none")}
			</p>
		);
	};
	return (
		<details className="mb-2 rounded-lg border border-border bg-muted/60 px-4 py-3">
			<summary className="cursor-pointer text-sm font-medium text-foreground">
				{score === null || score === undefined
					? t("message.spam.unavailable")
					: t("message.spam.score", {
							score,
							verdict: verdict ?? t("message.spam.inbox"),
						})}
			</summary>
			{renderAnalysis()}
		</details>
	);
}
