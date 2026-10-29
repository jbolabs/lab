import { AlertTriangle, Check } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export const ROW_GRID =
	"grid gap-3 rounded-lg px-4 py-3 text-sm sm:grid-cols-[auto_minmax(8rem,14rem)_minmax(0,1fr)_auto] sm:items-start";

export function StatusBadge({
	ok,
	tone = "red",
}: {
	ok: boolean;
	tone?: "red" | "neutral";
}) {
	return (
		<Badge
			variant={(() => {
				if (ok) {
					return "success";
				}
				if (tone === "red") {
					return "destructive-soft";
				}
				return "secondary";
			})()}
		>
			{ok ? <Check /> : <AlertTriangle />}
		</Badge>
	);
}

/** An icon-left status line shared by the domain setup and sending setup lists. */
export function StatusRow({
	ok,
	title,
	hint,
	children,
	action,
}: {
	ok: boolean;
	title: string;
	hint: string;
	children?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<li className={`${ROW_GRID} border bg-card`}>
			<StatusBadge ok={ok} />
			<span className="min-w-0">
				<span className="block font-medium text-foreground">{title}</span>
				<span className="block text-xs text-muted-foreground">{hint}</span>
			</span>
			<span className="min-w-0 break-words text-muted-foreground">
				{children}
			</span>
			{action && (
				<span className="flex flex-wrap items-center gap-2">{action}</span>
			)}
		</li>
	);
}
