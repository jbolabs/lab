import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DragEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { getMessageDragData } from "@/lib/messages/drag-utils";
import { useSelectedMailbox } from "./mailbox-provider";
import { useSidebar } from "./sidebar-state";
import { useCompose } from "./compose/compose-context";
import { HintTooltip } from "@/components/hint-tooltip";
import {
	preloadMailboxPage,
	waitForNavigationProgress,
} from "./components-nav-utils";
import type { NavLink } from "./components-nav-types";

type Props = {
	link: NavLink;
	iconClassName?: string;
	labelClassName?: string;
	wrap?: boolean;
};
export function NavItem({ link, iconClassName, labelClassName, wrap }: Props) {
	const pathname = usePathname();
	const router = useRouter();
	const { openComposer } = useCompose();
	const { selectedMailbox } = useSelectedMailbox();
	const { minimal } = useSidebar();
	const [dragOver, setDragOver] = useState(false);
	const [navigationProgress, setNavigationProgress] = useState<number | null>(
		null,
	);

	useEffect(() => {
		if (navigationProgress === null) return;
		setNavigationProgress(100);
		const timer = window.setTimeout(() => setNavigationProgress(null), 220);
		return () => window.clearTimeout(timer);
	}, [pathname]);

	if (!link.href) {
		return <span className="flex-1" />;
	}

	const Icon = link.icon;
	if (!Icon) return null;
	const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
	const classes = cn(
		"flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring max-md:min-h-11",
		minimal && "relative mx-auto size-10 justify-center px-0",
		active
			? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
			: "hover:bg-sidebar-accent",
		dragOver && "bg-signal-soft text-signal-soft-foreground ring-1 ring-ring",
		link.primary && "mb-3 h-10 w-full",
		link.count && "font-semibold",
		link.primary && minimal && "size-10 px-0",
		wrap && !minimal && "h-auto min-h-9 items-start py-2",
	);
	const dropProps = link.onMessageDrop
		? {
				onDragOver: (event: DragEvent) => {
					event.preventDefault();
					event.dataTransfer.dropEffect = "move";
					setDragOver(true);
				},
				onDragLeave: () => setDragOver(false),
				onDrop: (event: DragEvent) => {
					const payload = getMessageDragData(event.dataTransfer);
					setDragOver(false);
					if (!payload) return;
					event.preventDefault();
					link.onMessageDrop?.(payload.messageIds);
				},
			}
		: {};

	if (link.href === "/compose") {
		const composeButton = (
			<Button
				type="button"
				onClick={openComposer}
				className={cn(
					"mb-3 max-md:min-h-11",
					minimal ? "size-10 p-0" : "w-full justify-start",
				)}
				aria-label={minimal ? link.label : undefined}
				{...dropProps}
			>
				<Icon
					data-icon="inline-start"
					style={{ color: link.iconColor }}
					className={iconClassName}
				/>
				{!minimal && (
					<span
						className={cn(
							"flex-1",
							typeof link.count === "number" &&
								link.count > 0 &&
								"font-semibold",
						)}
					>
						{link.label}
					</span>
				)}
				{!minimal && typeof link.count === "number" && link.count > 0 && (
					<span className="ml-auto mr-3 rounded-full px-2 py-0.5 text-sm font-semibold text-foreground/80">
						{link.count > 99 ? "99+" : link.count}
					</span>
				)}
				{minimal && typeof link.count === "number" && link.count > 0 && (
					<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
						{link.count > 99 ? "99+" : link.count}
					</span>
				)}
			</Button>
		);
		return minimal && link.label ? (
			<HintTooltip label={link.label} side="right" className="mx-auto">
				{composeButton}
			</HintTooltip>
		) : (
			composeButton
		);
	}

	async function navigate(event: MouseEvent<HTMLAnchorElement>) {
		if (
			!link.preloadMessages ||
			active ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		setNavigationProgress(12);
		const timer = window.setInterval(() => {
			setNavigationProgress((current) =>
				current === null ? 12 : Math.min(90, current + 8),
			);
		}, 80);
		try {
			router.prefetch(link.href!);
			await Promise.all([
				preloadMailboxPage(link.href!, selectedMailbox?.id),
				waitForNavigationProgress(),
			]);
			setNavigationProgress(100);
			await waitForNavigationProgress(160);
			router.push(link.href!);
		} catch {
			setNavigationProgress(null);
		} finally {
			window.clearInterval(timer);
		}
	}

	const navLink = (
		<Link
			href={link.href}
			onClick={navigate}
			aria-label={minimal ? link.label : undefined}
			aria-current={active ? "page" : undefined}
			className={classes}
			{...dropProps}
		>
			<Icon
				// className={minimal ? "h-4 w-4" : "h-5 w-5"}
				style={{ color: link.iconColor }}
				size={16}
				className={cn(
					"max-md:h-5 max-md:w-5",
					wrap && !minimal && "mt-0.5 shrink-0",
					iconClassName,
				)}
			/>
			{!minimal && (
				<span
					className={cn(
						"flex-1",
						wrap && "min-w-0 break-words leading-5 max-md:leading-6",
						labelClassName,
						typeof link.count === "number" && link.count > 0 && "font-semibold",
					)}
				>
					{link.label}
				</span>
			)}
			{!minimal && typeof link.count === "number" && link.count > 0 && (
				<span
					className={cn(
						"ml-auto mr-3 rounded-full px-2 py-0.5 text-sm font-semibold text-foreground/80",
						wrap && "shrink-0 py-0 leading-5",
					)}
				>
					{link.count > 99 ? "99+" : link.count}
				</span>
			)}
			{minimal && typeof link.count === "number" && link.count > 0 && (
				<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
					{link.count > 99 ? "99+" : link.count}
				</span>
			)}
		</Link>
	);

	return (
		<>
			{navigationProgress !== null && (
				<div className="fixed inset-x-0 top-0 z-[120] h-1 bg-signal-soft">
					<div
						className="h-full bg-primary transition-[width] duration-100 ease-out"
						style={{ width: `${navigationProgress}%` }}
					/>
				</div>
			)}
			{minimal && link.label ? (
				<HintTooltip label={link.label} side="right" className="mx-auto">
					{navLink}
				</HintTooltip>
			) : (
				navLink
			)}
		</>
	);
}
