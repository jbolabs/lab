import { RouteLoadingBar } from "@/components/route-loading-bar";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

export default function AdminLoading() {
	return <div aria-busy="true" className="flex flex-col gap-6">
		<RouteLoadingBar />
		<Skeleton className="h-8 w-48" />
		<SkeletonRows count={4} />
	</div>;
}
