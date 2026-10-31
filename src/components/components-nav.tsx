import type { DragEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";

import Link from "@/components/app-link";
import { HintTooltip } from "@/components/hint-tooltip";
import { Button } from "@/components/ui/button";
import { withCleanup } from "@/lib/async-cleanup";
import { getMessageDragData } from "@/lib/messages/drag-utils";
import { usePathname, useRouter } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import type { NavLink } from "./components-nav-types";
import {
	preloadMailboxPage,
	waitForNavigationProgress,
} from "./components-nav-utils";
import { useCompose } from "./compose/compose-context";
import { useSelectedMailbox } from "./mailbox-provider";
import { sidebarNavItemClass } from "./sidebar-nav-item-utils";
import { useSidebar } from "./sidebar-state";

interface Props {
	link: NavLink;
	iconClassName?: string;
	labelClassName?: string;
	wrap?: boolean;
}

function navClasses(
	link: NavLink,
	minimal: boolean,
	active: boolean,
	dragOver: boolean,
	wrap?: boolean
) {
	return cn(
		sidebarNavItemClass({ active, dropTarget: dragOver }),
		"h-9 gap-3 px-3",
		minimal && "relative mx-auto size-10 justify-center px-0",
		link.primary && "mb-3 h-10 w-full",
		link.count && "font-semibold",
		link.primary && minimal && "size-10 px-0",
		wrap && !minimal && "h-auto min-h-9 items-start py-2"
	);
}
function NavCount({
	count,
	minimal,
	wrap,
}: {
	count?: number;
	minimal: boolean;
	wrap?: boolean;
}) {
	if (typeof count !== "number" || count <= 0) {
		return null;
	}
	return (
		<span
			className={
				minimal
					? "absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-xs leading-4 font-semibold text-primary-foreground"
					: cn(
							"mr-3 ml-auto rounded-full px-2 py-0.5 text-sm font-semibold text-foreground/80",
							wrap && "shrink-0 py-0 leading-5"
						)
			}
		>
			{count > 99 ? "99+" : count}
		</span>
	);
}
function NavContent({
	link,
	minimal,
	iconClassName,
	labelClassName,
	wrap,
}: Props & { minimal: boolean }) {
	const Icon = link.icon;
	if (!Icon) {
		return null;
	}
	return (
		<>
			<Icon
				data-icon="inline-start"
				size={16}
				style={{ "--nav-icon-color": link.iconColor } as React.CSSProperties}
				className={cn(
					"text-(--nav-icon-color) max-md:h-5 max-md:w-5",
					wrap && !minimal && "mt-0.5 shrink-0",
					iconClassName
				)}
			/>
			{!minimal && (
				<span
					className={cn(
						"flex-1",
						wrap && "min-w-0 leading-5 break-words max-md:leading-6",
						labelClassName,
						typeof link.count === "number" && link.count > 0 && "font-semibold"
					)}
				>
					{link.label}
				</span>
			)}
			<NavCount count={link.count} minimal={minimal} wrap={wrap} />
		</>
	);
}
export function NavItem({ link, iconClassName, labelClassName, wrap }: Props) {
	const pathname = usePathname();
	const router = useRouter();
	const { openComposer } = useCompose();
	const { selectedMailbox } = useSelectedMailbox();
	const { minimal } = useSidebar();
	const [dragOver, setDragOver] = useState(false);
	const [navigationProgress, setNavigationProgress] = useState<number | null>(
		null
	);

	const [progressPath, setProgressPath] = useState(pathname);
	if (progressPath !== pathname) {
		setProgressPath(pathname);
		setNavigationProgress(navigationProgress === null ? null : 100);
	}
	useEffect(() => {
		if (navigationProgress !== 100) {
			return;
		}
		const timer = window.setTimeout(() => setNavigationProgress(null), 220);
		return () => window.clearTimeout(timer);
	}, [navigationProgress]);

	const { href } = link;
	if (!href) {
		return <span className="flex-1" />;
	}

	const Icon = link.icon;
	if (!Icon) {
		return null;
	}
	const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
	const classes = navClasses(link, minimal, active, dragOver, wrap);
	const dropProps = link.onMessageDrop
		? {
				onDragLeave: () => setDragOver(false),
				onDragOver: (event: DragEvent) => {
					event.preventDefault();
					event.dataTransfer.dropEffect = "move";
					setDragOver(true);
				},
				onDrop: (event: DragEvent) => {
					const payload = getMessageDragData(event.dataTransfer);
					setDragOver(false);
					if (!payload) {
						return;
					}
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
				size={minimal ? "icon-lg" : "default"}
				className={cn("mb-3", !minimal && "w-full justify-start")}
				aria-label={minimal ? link.label : undefined}
				{...dropProps}
			>
				<NavContent
					link={link}
					minimal={minimal}
					iconClassName={iconClassName}
				/>
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
			!href ||
			!link.preloadMessages ||
			active ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		event.preventDefault();
		setNavigationProgress(12);
		const timer = window.setInterval(() => {
			setNavigationProgress((current) =>
				current === null ? 12 : Math.min(90, current + 8)
			);
		}, 80);
		return await withCleanup(
			async () => {
				try {
					router.prefetch(href);
					await Promise.all([
						preloadMailboxPage(href, selectedMailbox?.id),
						waitForNavigationProgress(),
					]);
					setNavigationProgress(100);
					await waitForNavigationProgress(160);
					router.push(href);
				} catch {
					setNavigationProgress(null);
				}
			},
			() => {
				window.clearInterval(timer);
			}
		);
	}

	const navLink = (
		<Link
			href={href}
			onClick={navigate}
			aria-label={minimal ? link.label : undefined}
			aria-current={active ? "page" : undefined}
			className={classes}
			{...dropProps}
		>
			<NavContent
				link={link}
				minimal={minimal}
				iconClassName={iconClassName}
				labelClassName={labelClassName}
				wrap={wrap}
			/>
		</Link>
	);

	return (
		<>
			{navigationProgress !== null && (
				<div className="fixed inset-x-0 top-0 z-120 h-1 bg-signal-soft">
					<div
						className="h-full w-(--nav-progress) bg-primary transition-all duration-100 ease-out"
						style={
							{
								"--nav-progress": `${navigationProgress}%`,
							} as React.CSSProperties
						}
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
