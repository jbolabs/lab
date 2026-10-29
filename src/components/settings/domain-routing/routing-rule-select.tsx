import type * as React from "react";

import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/** A full-width shadcn NativeSelect for routing rule fields. */
export function RoutingRuleSelect({
	className,
	...props
}: React.ComponentProps<typeof NativeSelect>) {
	return (
		<NativeSelect
			containerClassName="block w-full min-w-0"

			className={cn("truncate", className)}
			{...props}
		/>
	);
}
