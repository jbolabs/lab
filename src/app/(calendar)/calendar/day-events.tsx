"use client";
import { Fragment, memo, useMemo } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";

import { layoutLength } from "@/app/layout-values";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { normalizeCalendarColor } from "@/lib/calendar/colors";
import { cn as clsx } from "@/lib/utils";

import type { DayEventsProps } from "./day-events-types";
import type { EventResizeEdge } from "./types";
import {
	addDays,
	dateKey,
	EVENT_COLOR_CLASSES,
	eventPosition,
	formatEventRange,
	PAST_EVENT_COLOR_CLASSES,
} from "./utils";

// Memoized so pointer-move / drag-over preview updates in the page do not
// recompute positions (timezone math) and re-render every event block.
function DayEventsImpl({
	day,
	events,
	currentTime,
	busy,
	activeEventId,
	onEdit,
	onDragStart,
	onDragEnd,
	onResizeStart,
	onResizeMove,
	onResizeEnd,
	onResizeCancel,
}: DayEventsProps) {
	const { t } = useLanguage();
	const nextDay = useMemo(() => addDays(day, 1), [day]);
	const items = useMemo(
		() =>
			events.flatMap((event) => {
				if (
					!(new Date(event.startsAt) < nextDay && new Date(event.endsAt) > day)
				) {
					return [];
				}
				const position = eventPosition(event, day);
				if (!position) {
					return [];
				}
				return [
					{
						canResizeEnd: new Date(event.endsAt).getTime() <= nextDay.getTime(),
						canResizeStart: dateKey(new Date(event.startsAt)) === dateKey(day),
						color: normalizeCalendarColor(event.color),
						event,
						position,
						range: formatEventRange(event),
					},
				];
			}),
		[events, day, nextDay]
	);

	return (
		<>
			{items.map(
				({ event, position, color, range, canResizeStart, canResizeEnd }) => {
					const isPastEvent = new Date(event.endsAt).getTime() <= currentTime;
					const edges = (["start", "end"] as const).filter((edge) =>
						edge === "start" ? canResizeStart : canResizeEnd
					);
					// Keep the grab zone inside the event so it never steals clicks from neighbours.
					const handleHeight = Math.max(4, Math.min(10, position.height / 3));
					return (
						<Fragment key={event.id}>
							<div
								className={clsx(
									`absolute right-1 left-1 z-10 flex cursor-move flex-col items-start justify-start overflow-hidden rounded-md pr-2 pl-4 text-left hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring ${isPastEvent ? PAST_EVENT_COLOR_CLASSES[color] : EVENT_COLOR_CLASSES[color]} ${position.height >= 20 ? "py-1.5" : "py-0"} ${activeEventId === event.id ? "opacity-40" : ""}`,
									"top-(--layout-top) h-(--layout-height)"
								)}
								style={
									{
										"--layout-height": layoutLength(position.height),
										"--layout-top": layoutLength(position.top),
									} as React.CSSProperties
								}
							>
								<Button
									variant="plain"
									size="none"
									className="absolute inset-0 flex-col items-start justify-start overflow-hidden text-left"
									type="button"
									draggable={!busy}
									onClick={() => onEdit(event)}
									onDragStart={(dragEvent: DragEvent<HTMLButtonElement>) =>
										onDragStart(dragEvent, event)
									}
									onDragEnd={onDragEnd}
									title={`${event.title} · ${range}`}
								>
									<span
										className={clsx(
											"absolute top-1 left-1 block w-1 rounded-full bg-current",
											"h-[calc(100%_-_8px)]"
										)}
									/>
									<div
										className={
											position.height >= 20
												? "w-full py-1.5 pr-2 pl-4"
												: "w-full pr-2 pl-4"
										}
									>
										{position.height >= 15 && (
											<span className="block w-full truncate text-xs leading-4 font-semibold">
												{event.title}
											</span>
										)}
										{position.height >= 34 && (
											<span className="block w-full truncate text-xs leading-4 opacity-70">
												{range}
											</span>
										)}
									</div>
								</Button>
							</div>
							{edges.map((edge: EventResizeEdge) => (
								<div
									className={clsx(
										clsx(
											"absolute right-1 left-1 z-20 cursor-ns-resize touch-none bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-ring"
										),
										"top-(--layout-top) h-(--layout-height)"
									)}
									style={
										{
											"--layout-height": layoutLength(handleHeight),
											"--layout-top": layoutLength(
												edge === "start"
													? position.top
													: position.top + position.height - handleHeight
											),
										} as React.CSSProperties
									}
									key={edge}
								>
									<Button
										variant="plain"
										size="none"
										className="absolute inset-0 flex-col items-start justify-start overflow-hidden text-left"
										type="button"
										draggable={false}
										aria-label={t(
											edge === "start"
												? "calendar.resizeEdge.start"
												: "calendar.resizeEdge.end",
											{ title: event.title }
										)}
										onPointerDown={(
											pointerEvent: ReactPointerEvent<HTMLButtonElement>
										) => onResizeStart(pointerEvent, event, day, edge)}
										onPointerMove={onResizeMove}
										onPointerUp={onResizeEnd}
										onPointerCancel={onResizeCancel}
										onClick={(clickEvent) => clickEvent.stopPropagation()}
									/>
								</div>
							))}
						</Fragment>
					);
				}
			)}
		</>
	);
}

export const DayEvents = memo(DayEventsImpl);
export type { CalendarEvent } from "./types";
