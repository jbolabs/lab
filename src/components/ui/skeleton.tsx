import { cn } from "@/lib/utils"
import type { SkeletonRowsProps } from "./skeleton-types"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

/** Placeholder message rows for lists that are still loading. */
function SkeletonRows({ count = 5, compact = false }: SkeletonRowsProps) {
  return (
    <div className="divide-y">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn("flex items-center gap-3", compact ? "px-4 py-3" : "px-6 py-4")}>
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className={cn("shrink-0", compact ? "size-9 rounded-full" : "h-5 w-36")} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            {compact && <Skeleton className="h-3 w-5/6" />}
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonRows }
