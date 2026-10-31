import { cn } from "@/lib/utils";

/**
 * The one look for a sidebar link (mail, admin, settings and Drive navs). Pill-shaped like the
 * theme's buttons, so links sit flush with Compose and the ghost section headers around them.
 */
export function sidebarNavItemClass({
	active,
	dropTarget,
}: {
	active: boolean;
	dropTarget?: boolean;
}) {
	const base =
		"flex items-center rounded-4xl text-sm text-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring max-md:min-h-11";
	// A drop target never takes the hover fill, which would cover its highlight while dragging over it.
	if (dropTarget) {
		return cn(
			base,
			"bg-signal-soft text-signal-soft-foreground ring-2 ring-ring ring-inset"
		);
	}
	if (active) {
		return cn(
			base,
			"bg-sidebar-accent font-medium text-sidebar-accent-foreground"
		);
	}
	return cn(base, "hover:bg-sidebar-accent");
}
