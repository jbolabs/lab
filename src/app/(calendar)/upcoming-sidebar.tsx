"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn as clsx } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { SidebarResizeBoundary } from "@/components/sidebar-resize-boundary";
import { useSidebar } from "@/components/sidebar-state";
import { authFetch } from "@/lib/auth/client";
import { normalizeCalendarColor } from "@/lib/calendar/colors";
import type { CalendarEvent } from "./calendar/types";
import { addDays, expandCalendarEvents, formatEventRange, groupUpcomingEvents, startOfDay, takeUpcomingGroups, UPCOMING_BATCH_SIZE } from "./calendar/utils";
import type { UpcomingSidebarProps } from "./upcoming-sidebar-types";

export function UpcomingSidebar({ events, onSelect, drawer = false, refreshKey }: UpcomingSidebarProps) {
	const { t } = useLanguage();
	const { minimal: sidebarMinimal, mobile } = useSidebar();
	// The drawer variant is always expanded; it only mounts while the mobile menu is open.
	const minimal = !drawer && (sidebarMinimal || mobile);
	const router = useRouter();
	const [loadedEvents, setLoadedEvents] = useState<CalendarEvent[]>([]);
	const [loadError, setLoadError] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [visibleCount, setVisibleCount] = useState(UPCOMING_BATCH_SIZE);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const today = useMemo(() => startOfDay(new Date()), []);
	const shownEvents = events ?? loadedEvents;
	const groups = useMemo(() => groupUpcomingEvents(shownEvents, today, t), [shownEvents, today, t]);
	const total = useMemo(() => groups.reduce((count, group) => count + group.events.length, 0), [groups]);
	const visibleGroups = useMemo(() => takeUpcomingGroups(groups, visibleCount), [groups, visibleCount]);

	useEffect(() => {
		if (events !== undefined) return;
		let active = true;
		const end = addDays(today, 90);
		void authFetch(`/api/calendar/events?start=${today.toISOString()}&end=${end.toISOString()}`)
			.then(async (response) => {
				if (!response.ok) throw new Error();
				return response.json() as Promise<{ events?: CalendarEvent[] }>;
			})
			.then((data) => { if (active) { setLoadedEvents(expandCalendarEvents(data.events ?? [], today, end)); setLoadError(false); setLoaded(true); } })
			.catch(() => { if (active) setLoadError(true); });
		return () => { active = false; };
	}, [events, today, refreshKey]);

	useEffect(() => { setVisibleCount(UPCOMING_BATCH_SIZE); }, [shownEvents]);

	useEffect(() => {
		if (minimal || visibleCount >= total || !scrollRef.current || !sentinelRef.current) return;
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry?.isIntersecting) return;
			observer.disconnect();
			setVisibleCount((count) => Math.min(count + UPCOMING_BATCH_SIZE, total));
		}, { root: scrollRef.current, rootMargin: "0px 0px 100px 0px" });
		observer.observe(sentinelRef.current);
		return () => observer.disconnect();
	}, [minimal, total, visibleCount]);

	const awaiting = events === undefined && !loaded && !loadError;
	const SKELETON = <div className="flex flex-col gap-6" aria-label={t("calendar.loadingUpcoming")} aria-busy="true">{[0, 1].map((group) => <div key={group}><Skeleton className="mb-3 h-4 w-28 rounded bg-accent" /><div className="flex flex-col gap-3">{[0, 1, 2].map((row) => <div key={row} className="flex items-start gap-3"><Skeleton className="mt-0.5 size-4 shrink-0 rounded-full bg-accent" /><span className="min-w-0 flex-1 flex flex-col gap-1.5"><Skeleton className="block h-3.5 w-3/4 rounded bg-accent" /><Skeleton className="block h-3 w-1/2 rounded bg-muted" /></span></div>)}</div></div>)}</div>;
	const list = !minimal && <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain rounded-t-3xl px-5 py-5">
			{awaiting ? SKELETON : groups.length === 0 ? <div><h2 className="text-lg font-semibold text-foreground">{t("calendar.upcoming")}</h2><p className="mt-4 text-sm text-muted-foreground">{loadError ? t("calendar.upcomingLoadFailed") : t("calendar.noUpcoming")}</p></div> : visibleGroups.map((group) => <section key={group.key} className="mb-6 last:mb-0"><h2 className="sticky -top-5 z-10 -mx-5 mb-2 bg-card px-5 py-2 text-base font-semibold text-foreground">{group.label}</h2><div className="flex flex-col gap-2">{group.events.map((event) => <Button variant="ghost" key={event.id} type="button" onClick={() => onSelect ? onSelect(event) : router.push(`/calendar?event=${encodeURIComponent(event.id)}`)} className= "group flex w-full items-start gap-3 text-left [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"><span className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-background ring-1 ring-border" style={{ backgroundColor: normalizeCalendarColor(event.color) }} /><span className="min-w-0"><span className="block truncate text-sm text-foreground/80 group-hover:text-foreground">{event.title}</span><span className="block text-xs text-muted-foreground">{formatEventRange(event)}</span></span></Button>)}</div></section>)}
			{visibleCount < total && <div ref={sentinelRef} aria-hidden="true" className="h-1" />}
		</div>;

	if (drawer) return <div className="h-full min-h-0 bg-card">{list}</div>;

	return <aside className={clsx("relative shrink-0 rounded-t-3xl bg-card transition-[width,max-height] duration-200 ease-in-out motion-reduce:transition-none lg:h-full lg:max-h-none", minimal ? "w-0 max-h-0" : "w-full max-h-[36vh] lg:w-[var(--sidebar-width)]")} aria-hidden={minimal}>
		{list}
		{!minimal && <div className="hidden lg:block"><SidebarResizeBoundary /></div>}
	</aside>;
}
