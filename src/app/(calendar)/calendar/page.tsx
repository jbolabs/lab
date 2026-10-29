"use client";
import {
	AlignLeft,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock3,
	MapPin,
	MoreVertical,
	Palette,
	Plus,
	Repeat2,
	Trash2,
	UsersRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useConfirmation } from "@/app/(calendar)/use-confirmation";
import { useHeaderSlot } from "@/app/header-slot";
import { layoutLength } from "@/app/layout-values";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { RouteLoadingBarPortal } from "@/components/route-loading-bar-portal";
import { useSidebar } from "@/components/sidebar-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { withCleanup } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { normalizeCalendarColor } from "@/lib/calendar/colors";
import {
	DEFAULT_REPEAT_DAYS,
	parseCalendarRepeatDays,
} from "@/lib/calendar/recurrence";
import type { CalendarRepeat } from "@/lib/calendar/types";
import { folderColorKeys } from "@/lib/folders/color-keys";
import {
	DEFAULT_FOLDER_COLOR,
	FOLDER_COLOR_OPTIONS,
} from "@/lib/folders/colors";
import type { TranslationKey } from "@/lib/i18n/types";
import {
	formatUserDate,
	getUserTimeZone,
	parseUserDateTimeLocal,
} from "@/lib/time/utils";
import { cn as clsx } from "@/lib/utils";

import { UpcomingSidebar } from "../upcoming-sidebar";
import { DayEvents } from "./day-events";
import type {
	CalendarEvent,
	CalendarView,
	EventDragPreview,
	EventResizeEdge,
	EventResizeSession,
} from "./types";
import {
	addDays,
	addMonths,
	calendarAnchorDay,
	CALENDAR_END_HOUR,
	CALENDAR_HOUR_HEIGHT,
	CALENDAR_START_HOUR,
	currentTimePosition,
	dateKey,
	defaultCalendarStart,
	dropStartForPosition,
	EVENT_COLOR_CLASSES,
	eventEndAfterMinutes,
	eventPosition,
	expandCalendarEvents,
	formatEventRange,
	formatHour,
	formatLocalDateTime,
	monthGridDates,
	PAST_EVENT_COLOR_CLASSES,
	rescheduleCalendarOccurrence,
	resizeEventTimes,
	startOfDay,
	startOfMonth,
	startOfWeek,
	WEEKDAY_OPTIONS,
} from "./utils";

export default function CalendarPage() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useConfirmation();
	const isMobile = useIsMobile();
	const Editor = isMobile ? Drawer : Dialog;
	const EditorContent = isMobile ? DrawerContent : DialogContent;
	const EditorTitle = isMobile ? DrawerTitle : DialogTitle;
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [settledRequest, setSettledRequest] = useState("");
	const [eventsVersion, setEventsVersion] = useState(0);
	const [currentTime, setCurrentTime] = useState(() => Date.now());
	const [visibleDate, setVisibleDate] = useState(() => new Date());
	const [view, setView] = useState<CalendarView>("week");
	const [monthPickerOpen, setMonthPickerOpen] = useState(false);
	const [pickerMonth, setPickerMonth] = useState(() => new Date());
	const openedEventFromUrl = useRef<string | null>(null);
	const headerTarget = useHeaderSlot("#calendar-header-slot");
	const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
	const [resizingEvent, setResizingEvent] = useState<CalendarEvent | null>(
		null
	);
	const [dragPreview, setDragPreview] = useState<EventDragPreview | null>(null);
	const dragOffsetPixels = useRef(0);
	const resizeSession = useRef<EventResizeSession | null>(null);
	const [title, setTitle] = useState("");
	const [color, setColor] = useState<string>(DEFAULT_FOLDER_COLOR);
	const [repeat, setRepeat] = useState<CalendarRepeat>("none");
	const [repeatDays, setRepeatDays] = useState<number[]>(DEFAULT_REPEAT_DAYS);
	const [startsAt, setStartsAt] = useState("");
	const [endsAt, setEndsAt] = useState("");
	const [durationOptionsOpen, setDurationOptionsOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const [closingEventEditor, setClosingEventEditor] = useState(false);
	const [guests, setGuests] = useState("");
	const [location, setLocation] = useState("");
	const [description, setDescription] = useState("");
	const [editing, setEditing] = useState<CalendarEvent | null>(null);
	const [pendingAction, setPendingAction] = useState<"save" | string | null>(
		null
	);
	const router = useRouter();
	const eventFromUrl = useSearchParams().get("event");
	const { selectedMailbox } = useSelectedMailbox();
	const { minimal: sidebarMinimal, mobile } = useSidebar();
	const minimal = sidebarMinimal || mobile;

	const now = new Date(currentTime);
	const [today, setToday] = useState(() => startOfDay(new Date()));
	const weekStart = useMemo(() => startOfWeek(visibleDate), [visibleDate]);
	const days = useMemo(
		() =>
			view === "day"
				? [startOfDay(visibleDate)]
				: Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
		[view, visibleDate, weekStart]
	);
	const pickerDates = useMemo(() => monthGridDates(pickerMonth), [pickerMonth]);
	const previewEvent = useMemo(() => {
		const source = draggedEvent || resizingEvent;
		if (!dragPreview || !source) {
			return null;
		}
		return {
			...source,
			endsAt: dragPreview.endsAt.toISOString(),
			startsAt: dragPreview.startsAt.toISOString(),
		};
	}, [dragPreview, draggedEvent, resizingEvent]);

	const previewPosition = useMemo(
		() =>
			dragPreview && previewEvent
				? eventPosition(previewEvent, dragPreview.day)
				: null,
		[dragPreview, previewEvent]
	);

	function editEvent(event: CalendarEvent) {
		setEditing(event);
		setTitle(event.title);
		setColor(normalizeCalendarColor(event.color));
		setRepeat(event.repeat);
		setRepeatDays(
			event.repeat === "weekdays"
				? parseCalendarRepeatDays(event.repeatDays)
				: DEFAULT_REPEAT_DAYS
		);
		setLocation(event.location ?? "");
		setDescription(event.description ?? "");
		setStartsAt(formatLocalDateTime(new Date(event.startsAt)));
		setEndsAt(formatLocalDateTime(new Date(event.endsAt)));
		setDurationOptionsOpen(false);
		setGuests(JSON.parse(event.attendees || "[]").join(", "));
		setClosingEventEditor(false);
		setAdding(true);
	}

	useEffect(() => {
		const interval = window.setInterval(() => {
			setCurrentTime(Date.now());
			const nextToday = startOfDay(new Date());
			setToday((previous) =>
				previous.getTime() === nextToday.getTime() ? previous : nextToday
			);
		}, 60_000);
		return () => window.clearInterval(interval);
	}, []);

	const calendarRequest = `${today.toISOString()}:${visibleDate.toISOString()}:${weekStart.toISOString()}:${eventsVersion}`;
	const loading = settledRequest !== calendarRequest;

	useEffect(() => {
		let active = true;
		const start = new Date(
			Math.min(
				today.getTime(),
				weekStart.getTime(),
				startOfDay(visibleDate).getTime()
			)
		);
		const end = new Date(
			Math.max(
				addDays(today, 90).getTime(),
				addDays(weekStart, 7).getTime(),
				addDays(visibleDate, 1).getTime()
			)
		);
		void authFetch(
			`/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
		)
			.then((response) => {
				if (!response.ok) {
					throw new Error(t("calendar.loadFailed"));
				}
				return response.json() as Promise<{
					events?: Parameters<typeof expandCalendarEvents>[0];
				}>;
			})
			.then((data) => {
				if (active) {
					setEvents(expandCalendarEvents(data.events ?? [], start, end));
				}

				return null;
			})
			.catch(() => {
				if (active) {
					toast.error(t("calendar.loadFailed"));
				}
			})
			.finally(() => {
				if (active) {
					setSettledRequest(calendarRequest);
				}
			});
		return () => {
			active = false;
		};
	}, [today, visibleDate, weekStart, t, calendarRequest]);

	const editFromUrl = useEffectEvent(editEvent);
	useEffect(() => {
		if (!eventFromUrl) {
			openedEventFromUrl.current = null;
			return;
		}
		if (openedEventFromUrl.current === eventFromUrl) {
			return;
		}
		const event = events.find((item) => item.id === eventFromUrl);
		if (!event) {
			return;
		}
		openedEventFromUrl.current = eventFromUrl;
		// oxlint-disable-next-line react/set-state-in-effect -- The router event parameter is an external command to open the editor, consumed once and removed from the URL.
		editFromUrl(event);
		// Drop the param so picking the same event again re-opens it.
		router.replace("/calendar");
	}, [events, eventFromUrl, router]);

	function openNewEvent(day = visibleDate, startAt?: Date) {
		const start = startAt ? new Date(startAt) : defaultCalendarStart(day);
		setEditing(null);
		setTitle("");
		setColor(DEFAULT_FOLDER_COLOR);
		setRepeat("none");
		setRepeatDays(DEFAULT_REPEAT_DAYS);
		setGuests("");
		setLocation("");
		setDescription("");
		setStartsAt(formatLocalDateTime(start));
		setEndsAt(formatLocalDateTime(new Date(start.getTime() + 60 * 60_000)));
		setDurationOptionsOpen(false);
		setClosingEventEditor(false);
		setAdding(true);
	}

	function addEvent() {
		setPendingAction("save");
		return withCleanup(
			async () => {
				try {
					const deriveEditedStart = () =>
						editing &&
						startsAt === formatLocalDateTime(new Date(editing.startsAt))
							? new Date(editing.startsAt)
							: parseUserDateTimeLocal(startsAt);
					const editedStart = deriveEditedStart();
					const deriveEditedEnd = () =>
						editing && endsAt === formatLocalDateTime(new Date(editing.endsAt))
							? new Date(editing.endsAt)
							: parseUserDateTimeLocal(endsAt);
					const editedEnd = deriveEditedEnd();
					if (!editedStart || !editedEnd || editedEnd <= editedStart) {
						toast.error(t("calendar.invalidTimes"));
						return;
					}
					const deriveMovingToPast = () =>
						Boolean(
							editing &&
							editing.repeat !== "none" &&
							editedStart.getTime() < Date.now() &&
							editedStart.getTime() !== new Date(editing.startsAt).getTime()
						);
					const movingToPast = deriveMovingToPast();
					const deriveEffectiveFrom = () =>
						editing && editing.repeat !== "none" && !movingToPast
							? new Date()
							: null;
					const effectiveFrom = deriveEffectiveFrom();
					let savedStart = editedStart;
					let savedEnd = editedEnd;
					if (editing && effectiveFrom) {
						const next = rescheduleCalendarOccurrence(
							editing,
							editedStart,
							editedEnd,
							effectiveFrom
						);
						if (!next) {
							toast.error(t("calendar.noFuture"));
							return;
						}
						savedStart = next.startsAt;
						savedEnd = next.endsAt;
					}
					const deriveRepeatAnchorDay = () =>
						editing?.repeat === "monthly" &&
						startsAt.slice(0, 10) ===
							formatLocalDateTime(new Date(editing.startsAt)).slice(0, 10)
							? (editing.repeatAnchorDay ??
								calendarAnchorDay(
									editing,
									new Date(editing.seriesStartsAt ?? editing.startsAt)
								))
							: calendarAnchorDay(editing, editedStart);
					const repeatAnchorDay = deriveRepeatAnchorDay();
					const response = await authFetch(
						editing
							? `/api/calendar/events/${editing.id}`
							: "/api/calendar/events",
						{
							body: JSON.stringify({
								attendees: guests.split(","),
								color,
								description,
								effectiveFrom: effectiveFrom?.toISOString(),
								endsAt: savedEnd.toISOString(),
								from:
									selectedMailbox?.senderAddresses?.[0] ??
									(selectedMailbox
										? `${selectedMailbox.localPart}@${selectedMailbox.hostname}`
										: ""),
								location,
								mailboxId: selectedMailbox?.id,
								moveOccurrenceToPast: movingToPast,
								repeat,
								repeatAnchorDay,
								repeatDays,
								startsAt: savedStart.toISOString(),
								timeZone: getUserTimeZone(),
								title,
							}),
							headers: { "Content-Type": "application/json" },
							method: editing ? "PATCH" : "POST",
						}
					);
					if (response.ok) {
						setEventsVersion((version) => version + 1);
						setClosingEventEditor(true);
						setAdding(false);
					} else {
						const result = (await response.json()) as { error?: string };
						toast.error(result.error ?? t("calendar.saveFailed"));
					}
				} catch {
					toast.error(t("calendar.saveFailed"));
				}
			},
			() => {
				setPendingAction(null);
			}
		);
	}

	async function deleteEvent(id: string) {
		const recurring = editing && editing.repeat !== "none";
		if (
			!(await confirm(
				recurring ? t("calendar.deleteFuture") : t("calendar.deleteEvent")
			))
		) {
			return;
		}
		setPendingAction(id);
		return withCleanup(
			async () => {
				try {
					const effectiveFrom = recurring
						? new Date().toISOString()
						: undefined;
					const response = await authFetch(`/api/calendar/events/${id}`, {
						body: effectiveFrom ? JSON.stringify({ effectiveFrom }) : undefined,
						headers: effectiveFrom
							? { "Content-Type": "application/json" }
							: undefined,
						method: "DELETE",
					});
					if (response.ok) {
						setEventsVersion((version) => version + 1);
						setClosingEventEditor(true);
						setAdding(false);
					} else {
						const result = (await response.json()) as { error?: string };
						toast.error(result.error ?? t("calendar.deleteFailed"));
					}
				} catch {
					toast.error(t("calendar.deleteFailed"));
				}
			},
			() => {
				setPendingAction(null);
			}
		);
	}

	function saveEventTimes(
		event: CalendarEvent,
		nextStartsAt: Date,
		nextEndsAt: Date
	) {
		if (
			nextStartsAt.getTime() === new Date(event.startsAt).getTime() &&
			nextEndsAt.getTime() === new Date(event.endsAt).getTime()
		) {
			setDraggedEvent(null);
			setResizingEvent(null);
			setDragPreview(null);
			return;
		}
		setPendingAction(event.id);
		// Non-recurring events move in place right away; the refetch below confirms.
		const previousEvents = event.repeat === "none" ? events : null;
		if (previousEvents) {
			setEvents((current) =>
				current.map((item) =>
					item.id === event.id
						? {
								...item,
								endsAt: nextEndsAt.toISOString(),
								startsAt: nextStartsAt.toISOString(),
							}
						: item
				)
			);
		}
		let saved = false;
		return withCleanup(
			async () => {
				try {
					const movingToPast =
						event.repeat !== "none" && nextStartsAt.getTime() < Date.now();
					const effectiveFrom =
						event.repeat !== "none" && !movingToPast ? new Date() : null;
					let savedStart = nextStartsAt;
					let savedEnd = nextEndsAt;
					if (effectiveFrom) {
						const next = rescheduleCalendarOccurrence(
							event,
							nextStartsAt,
							nextEndsAt,
							effectiveFrom
						);
						if (!next) {
							toast.error(t("calendar.noFuture"));
							return;
						}
						savedStart = next.startsAt;
						savedEnd = next.endsAt;
					}
					const response = await authFetch(`/api/calendar/events/${event.id}`, {
						body: JSON.stringify({
							attendees: JSON.parse(event.attendees || "[]"),
							color: event.color,
							description: event.description,
							effectiveFrom: effectiveFrom?.toISOString(),
							endsAt: savedEnd.toISOString(),
							from:
								selectedMailbox?.senderAddresses?.[0] ??
								(selectedMailbox
									? `${selectedMailbox.localPart}@${selectedMailbox.hostname}`
									: ""),
							location: event.location,
							moveOccurrenceToPast: movingToPast,
							repeat: event.repeat,
							repeatAnchorDay:
								event.repeat === "monthly" &&
								dateKey(nextStartsAt) === dateKey(new Date(event.startsAt))
									? (event.repeatAnchorDay ??
										calendarAnchorDay(
											event,
											new Date(event.seriesStartsAt ?? event.startsAt)
										))
									: calendarAnchorDay(event, nextStartsAt),
							repeatDays: parseCalendarRepeatDays(event.repeatDays),
							startsAt: savedStart.toISOString(),
							timeZone: getUserTimeZone(),
							title: event.title,
						}),
						headers: { "Content-Type": "application/json" },
						method: "PATCH",
					});
					if (!response.ok) {
						toast.error(t("calendar.updateTimeFailed"));
						return;
					}
					saved = true;
					setEventsVersion((version) => version + 1);
				} catch {
					toast.error(t("calendar.updateTimeFailed"));
				}
			},
			() => {
				if (previousEvents && !saved) {
					setEvents(previousEvents);
				}
				setDraggedEvent(null);
				setResizingEvent(null);
				setDragPreview(null);
				setPendingAction(null);
			}
		);
	}

	function moveEvent(event: CalendarEvent, day: Date, pixelsFromTop: number) {
		const nextStartsAt = dropStartForPosition(day, pixelsFromTop);
		const nextEndsAt = new Date(
			nextStartsAt.getTime() +
				new Date(event.endsAt).getTime() -
				new Date(event.startsAt).getTime()
		);
		void saveEventTimes(event, nextStartsAt, nextEndsAt);
	}

	function startResize(
		pointerEvent: ReactPointerEvent<HTMLButtonElement>,
		event: CalendarEvent,
		day: Date,
		edge: EventResizeEdge
	) {
		if (pendingAction !== null) {
			return;
		}
		const column = pointerEvent.currentTarget.parentElement;
		if (!column) {
			return;
		}
		pointerEvent.preventDefault();
		pointerEvent.stopPropagation();
		pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
		resizeSession.current = {
			columnTop: column.getBoundingClientRect().top,
			day,
			edge,
			event,
			moved: false,
			pointerY: pointerEvent.clientY,
		};
		setResizingEvent(event);
		setDragPreview({
			day,
			endsAt: new Date(event.endsAt),
			eventId: event.id,
			startsAt: new Date(event.startsAt),
		});
	}

	function updateResize(pointerEvent: ReactPointerEvent<HTMLButtonElement>) {
		const session = resizeSession.current;
		if (!session) {
			return;
		}
		if (Math.abs(pointerEvent.clientY - session.pointerY) < 3) {
			return;
		}
		session.moved = true;
		const times = resizeEventTimes(
			session.event,
			session.day,
			session.edge,
			pointerEvent.clientY - session.columnTop
		);
		// Times snap to 15 minutes, so most pointer moves change nothing.
		setDragPreview((current) =>
			current &&
			current.startsAt.getTime() === times.startsAt.getTime() &&
			current.endsAt.getTime() === times.endsAt.getTime()
				? current
				: {
						day: session.day,
						endsAt: times.endsAt,
						eventId: session.event.id,
						startsAt: times.startsAt,
					}
		);
	}

	function finishResize(pointerEvent: ReactPointerEvent<HTMLButtonElement>) {
		const session = resizeSession.current;
		if (!session) {
			return;
		}
		pointerEvent.preventDefault();
		pointerEvent.stopPropagation();
		resizeSession.current = null;
		if (!session.moved) {
			setResizingEvent(null);
			setDragPreview(null);
			return;
		}
		const times = resizeEventTimes(
			session.event,
			session.day,
			session.edge,
			pointerEvent.clientY - session.columnTop
		);
		void saveEventTimes(session.event, times.startsAt, times.endsAt);
	}

	function cancelResize() {
		resizeSession.current = null;
		setResizingEvent(null);
		setDragPreview(null);
	}

	const handlers = useRef({
		cancelResize,
		editEvent,
		finishResize,
		startResize,
		updateResize,
	});
	useEffect(() => {
		handlers.current = {
			cancelResize,
			editEvent,
			finishResize,
			startResize,
			updateResize,
		};
	});

	const onEditEvent = useCallback(
		(event: CalendarEvent) => handlers.current.editEvent(event),
		[]
	);
	const onResizeStart = useCallback(
		(
			pointerEvent: ReactPointerEvent<HTMLButtonElement>,
			event: CalendarEvent,
			day: Date,
			edge: EventResizeEdge
		) => handlers.current.startResize(pointerEvent, event, day, edge),
		[]
	);
	const onResizeMove = useCallback(
		(pointerEvent: ReactPointerEvent<HTMLButtonElement>) =>
			handlers.current.updateResize(pointerEvent),
		[]
	);
	const onResizeEnd = useCallback(
		(pointerEvent: ReactPointerEvent<HTMLButtonElement>) =>
			handlers.current.finishResize(pointerEvent),
		[]
	);
	const onResizeCancel = useCallback(() => handlers.current.cancelResize(), []);
	const onEventDragStart = useCallback(
		(dragEvent: DragEvent<HTMLButtonElement>, event: CalendarEvent) => {
			dragOffsetPixels.current =
				dragEvent.clientY - dragEvent.currentTarget.getBoundingClientRect().top;
			dragEvent.dataTransfer.setData("text/plain", event.id);
			dragEvent.dataTransfer.effectAllowed = "move";
			setDraggedEvent(event);
		},
		[]
	);
	const onEventDragEnd = useCallback(() => {
		setDraggedEvent(null);
		setDragPreview(null);
	}, []);
	const busy = pendingAction !== null;
	const activeEventId = draggedEvent?.id ?? resizingEvent?.id ?? null;

	function renderEventEditor() {
		return (
			<Editor
				open={!closingEventEditor}
				onOpenChange={(open) => {
					if (!open && pendingAction !== "save") {
						setClosingEventEditor(true);
						setAdding(false);
						setEditing(null);
					}
				}}
			>
				<EditorContent
					className="max-h-[90dvh] overflow-y-auto p-5 pb-safe-5 sm:max-w-xl"
					aria-describedby={undefined}
				>
					<EditorTitle>
						{editing ? t("calendar.editEvent") : t("calendar.createEvent")}
					</EditorTitle>
					<div className="flex items-start gap-3">
						<Input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder={t("calendar.addTitle")}
							aria-label={t("calendar.eventName")}
							variant="title"
							className="min-w-0 flex-1"
						/>
					</div>
					<FieldGroup className="mt-4">
						<div
							className={clsx(
								"grid items-start gap-3",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<Clock3
								aria-hidden="true"
								className="mt-2 size-5 text-muted-foreground"
							/>
							<div
								className="min-w-0"
								onBlur={(event) => {
									if (!event.currentTarget.contains(event.relatedTarget)) {
										setDurationOptionsOpen(false);
									}
								}}
							>
								<div
									className={clsx(
										"grid gap-1 sm:gap-2",
										"sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]"
									)}
								>
									<Field className="min-w-0">
										<InputGroup>
											<InputGroupAddon>
												<FieldLabel
													htmlFor="apps-field-srcappcalendarcalendarpagetsx-0"
													className=""
												>
													{t("calendar.from")}
												</FieldLabel>
											</InputGroupAddon>
											<InputGroupInput
												id="apps-field-srcappcalendarcalendarpagetsx-0"
												type="datetime-local"
												value={startsAt}
												onFocus={() => setDurationOptionsOpen(true)}
												onChange={(event) => setStartsAt(event.target.value)}
												aria-label={t("calendar.fromLabel")}
											/>
										</InputGroup>
									</Field>
									<Separator
										className="self-center max-sm:hidden"
										orientation="vertical"
									/>
									<Field className="min-w-0">
										<InputGroup>
											<InputGroupAddon>
												<FieldLabel
													htmlFor="apps-field-srcappcalendarcalendarpagetsx-1"
													className=""
												>
													{t("calendar.to")}
												</FieldLabel>
											</InputGroupAddon>
											<InputGroupInput
												id="apps-field-srcappcalendarcalendarpagetsx-1"
												type="datetime-local"
												value={endsAt}
												onFocus={() => setDurationOptionsOpen(true)}
												onChange={(event) => setEndsAt(event.target.value)}
												aria-label={t("calendar.toLabel")}
											/>
										</InputGroup>
									</Field>
								</div>
								{durationOptionsOpen && (
									<div
										className="flex flex-wrap gap-1 pt-1"
										aria-label={t("calendar.setDuration")}
									>
										{([15, 30, 60, 1440] as const)
											.map((minutes) => ({
												label: t(`calendar.dur.${minutes}`),
												minutes,
											}))
											.map((preset) => (
												<Button
													key={preset.minutes}
													type="button"
													variant="ghost"
													disabled={!parseUserDateTimeLocal(startsAt)}
													onClick={() => {
														setEndsAt(
															eventEndAfterMinutes(startsAt, preset.minutes)
														);
														setDurationOptionsOpen(false);
													}}
													size="xs"
												>
													{preset.label}
												</Button>
											))}
									</div>
								)}
							</div>
						</div>
						<div
							className={clsx(
								"grid items-start gap-3",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<Repeat2
								aria-hidden="true"
								className="mt-2 size-5 text-muted-foreground"
							/>
							<div className="min-w-0">
								<div className="flex min-w-0 flex-col gap-2">
									<NativeSelect
										containerClassName="min-w-0 w-full"
										value={repeat}
										onChange={(event) =>
											setRepeat(event.target.value as CalendarRepeat)
										}
										aria-label={t("calendar.repeat")}
									>
										<option value="none">{t("calendar.repeat.none")}</option>
										<option value="daily">{t("calendar.repeat.daily")}</option>
										<option value="weekly">
											{t("calendar.repeat.weekly")}
										</option>
										<option value="monthly">
											{t("calendar.repeat.monthly")}
										</option>
										<option value="weekdays">
											{t("calendar.repeat.weekdays")}
										</option>
									</NativeSelect>
									{repeat === "weekdays" && (
										<ToggleGroup
											type="multiple"
											variant="outline"
											value={repeatDays.map(String)}
											onValueChange={(values) =>
												setRepeatDays(
													values.map(Number).toSorted((a, b) => a - b)
												)
											}
											aria-label={t("calendar.repeatOnWeekdays")}
											className="flex flex-wrap justify-start"
										>
											{WEEKDAY_OPTIONS.map((day) => (
												<ToggleGroupItem
													key={day.value}
													value={String(day.value)}
													aria-label={t("calendar.repeatOn", {
														day: t(`weekday.${day.value}` as TranslationKey),
													})}
												>
													{t(
														`calendar.weekdayShort.${day.value}` as TranslationKey
													)}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									)}
								</div>
							</div>
						</div>
						<div
							className={clsx(
								"grid items-center gap-3",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<UsersRound
								aria-hidden="true"
								className="size-5 text-muted-foreground"
							/>
							<Input
								value={guests}
								onChange={(event) => setGuests(event.target.value)}
								placeholder={t("calendar.addGuests")}
								aria-label={t("calendar.guestsLabel")}
								className="min-w-0"
							/>
						</div>
						<div
							className={clsx(
								"grid items-center gap-3",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<MapPin
								aria-hidden="true"
								className="size-5 text-muted-foreground"
							/>
							<Input
								value={location}
								onChange={(event) => setLocation(event.target.value)}
								placeholder={t("calendar.addLocation")}
								aria-label={t("calendar.location")}
								className="min-w-0"
							/>
						</div>
						<div
							className={clsx(
								"grid items-start gap-3",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<AlignLeft
								aria-hidden="true"
								className="mt-2 size-5 text-muted-foreground"
							/>
							<Textarea
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder={t("calendar.addDescription")}
								aria-label={t("calendar.description")}
								rows={Math.max(1, description.split("\n").length)}
								className="resize-y"
							/>
						</div>
						<div
							className={clsx(
								"grid items-center gap-3",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<Palette
								aria-hidden="true"
								className="size-5 text-muted-foreground"
							/>
							<fieldset
								aria-label={t("calendar.eventColor")}
								className="flex flex-wrap items-center gap-1.5"
							>
								{FOLDER_COLOR_OPTIONS.map((option) => (
									<Button
										variant="ghost"
										key={option.value}
										type="button"

										aria-label={t(folderColorKeys[option.value])}
										title={t(folderColorKeys[option.value])}
										aria-pressed={color === option.value}
										onClick={() => setColor(option.value)}
										size="icon-sm"
										className="hover:scale-110"
									>
										<span
											className={clsx(
												clsx(
													"size-8 rounded-full border-2",
													color === option.value
														? "border-primary ring-2 ring-border ring-offset-2"
														: "border-transparent"
												),
												"bg-(--layout-color)"
											)}
											style={
												{
													"--layout-color": option.value,
												} as React.CSSProperties
											}
										/>
									</Button>
								))}
							</fieldset>
						</div>
						<div
							className={clsx(
								"grid gap-3 pt-6",
								"grid-cols-[24px_minmax(0,1fr)]"
							)}
						>
							<div />
							<div className="flex justify-between gap-2">
								<div>
									{editing && (
										<Button
											variant="ghost"
											disabled={pendingAction !== null}
											onClick={() => deleteEvent(editing.id)}
											className="text-destructive"
										>
											<Trash2 data-icon="inline-start" />
											{t("common.delete")}
										</Button>
									)}
								</div>
								<Button
									onClick={() => addEvent()}
									disabled={
										!title.trim() ||
										!parseUserDateTimeLocal(startsAt) ||
										!parseUserDateTimeLocal(endsAt) ||
										(parseUserDateTimeLocal(endsAt)?.getTime() ?? 0) <=
											(parseUserDateTimeLocal(startsAt)?.getTime() ?? 0) ||
										(repeat === "weekdays" && repeatDays.length === 0) ||
										pendingAction === "save"
									}
								>
									{pendingAction === "save"
										? t("common.saving")
										: t("settings.autoReply.save")}
								</Button>
							</div>
						</div>
					</FieldGroup>
				</EditorContent>
			</Editor>
		);
	}
	return (
		<div
			className={clsx(
				"flex h-full min-h-0 flex-col bg-sidebar pl-3 transition-all duration-200 ease-in-out motion-reduce:transition-none max-md:pl-0 lg:flex-row",
				minimal ? "gap-0" : "gap-3"
			)}
		>
			{confirmation}
			<h1 className="sr-only">{t("account.calendar")}</h1>
			{loading && <RouteLoadingBarPortal />}
			{headerTarget &&
				createPortal(
					<div className="flex min-w-0 flex-1 items-center justify-between gap-3">
						<div className="flex shrink-0 items-center gap-2">
							<Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										type="button"
										onClick={() => {
											setPickerMonth(startOfMonth(visibleDate));
										}}
										className="whitespace-nowrap"
										aria-haspopup="dialog"
										aria-expanded={monthPickerOpen}
									>
										<span className="text-lg font-semibold max-md:text-base max-md:font-medium">
											{formatUserDate(visibleDate, {
												month: "long",
												year: "numeric",
											})}
										</span>
										<ChevronDown
											data-icon="inline-start"
											className="text-muted-foreground"
										/>
									</Button>
								</PopoverTrigger>
								<PopoverContent
									align="start"
									aria-label={t("calendar.chooseDate")}
									className="w-[min(360px,calc(100vw-24px))]"
								>
									<div className="mb-4 flex items-center justify-between gap-3">
										<h2 className="text-xl font-semibold text-foreground">
											{formatUserDate(pickerMonth, {
												month: "long",
												year: "numeric",
											})}
										</h2>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												type="button"
												aria-label={t("calendar.previousMonth")}
												onClick={() =>
													setPickerMonth(addMonths(pickerMonth, -1))
												}
												size="icon"
											>
												<ChevronLeft data-icon="inline-start" />
											</Button>
											<Button
												variant="ghost"
												type="button"
												aria-label={t("calendar.nextMonth")}
												onClick={() =>
													setPickerMonth(addMonths(pickerMonth, 1))
												}
												size="icon"
											>
												<ChevronRight data-icon="inline-start" />
											</Button>
										</div>
									</div>
									<div className="grid grid-cols-7">
										{([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => (
											<span
												key={weekday}
												aria-label={t(`weekday.${weekday}`)}
												className="flex h-10 items-center justify-center text-sm font-medium text-muted-foreground"
											>
												{t(`weekday.${weekday}`).charAt(0).toUpperCase()}
											</span>
										))}
										{pickerDates.map((day) => {
											const selected = dateKey(day) === dateKey(visibleDate);
											const isToday = dateKey(day) === dateKey(today);
											const outsideMonth =
												dateKey(day).slice(0, 7) !==
												dateKey(pickerMonth).slice(0, 7);
											return (
												<Button
													variant="ghost"
													key={dateKey(day)}
													type="button"
													aria-label={formatUserDate(day, {
														day: "numeric",
														month: "long",
														weekday: "long",
														year: "numeric",
													})}
													aria-pressed={selected}
													onClick={() => {
														setVisibleDate(day);
														setMonthPickerOpen(false);
													}}
													size="icon-lg"
													className={
														outsideMonth
															? "mx-auto my-0.5 text-muted-foreground"
															: "mx-auto my-0.5"
													}
												>
													<span
														className={clsx(
															"flex size-10 items-center justify-center rounded-full text-base font-medium",
															selected
																? "bg-primary"
																: isToday && "ring-1 ring-ring"
														)}
													>
														{formatUserDate(day, { day: "numeric" })}
													</span>
												</Button>
											);
										})}
									</div>
								</PopoverContent>
							</Popover>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<Button
								variant="ghost"
								type="button"
								aria-label={t(
									view === "week"
										? "calendar.previousView.week"
										: "calendar.previousView.day"
								)}
								onClick={() =>
									setVisibleDate(
										addDays(visibleDate, view === "week" ? -7 : -1)
									)
								}
								size="icon-lg"
							>
								<ChevronLeft data-icon="inline-start" />
							</Button>
							<Button
								variant="ghost"
								type="button"
								aria-label={t(
									view === "week"
										? "calendar.nextView.week"
										: "calendar.nextView.day"
								)}
								onClick={() =>
									setVisibleDate(addDays(visibleDate, view === "week" ? 7 : 1))
								}
								size="icon-lg"
							>
								<ChevronRight data-icon="inline-start" />
							</Button>
							<Button
								variant="ghost"
								type="button"
								onClick={() => setVisibleDate(new Date())}
								size="lg"
								className="max-md:hidden"
							>
								{t("calendar.today")}
							</Button>
							<DropdownMenu.DropdownMenu>
								<DropdownMenu.DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										type="button"
										aria-label={t("calendar.options")}
										size="icon-lg"
										className="md:hidden"
									>
										<MoreVertical data-icon="inline-start" />
									</Button>
								</DropdownMenu.DropdownMenuTrigger>
								<DropdownMenu.DropdownMenuPortal>
									<DropdownMenu.DropdownMenuContent align="end" sideOffset={4}>
										<DropdownMenu.DropdownMenuGroup>
											<DropdownMenu.DropdownMenuItem
												onSelect={() => setVisibleDate(new Date())}
											>
												{t("calendar.today")}
											</DropdownMenu.DropdownMenuItem>
											<DropdownMenu.DropdownMenuSeparator />
											{(["week", "day"] as const).map((option) => (
												<DropdownMenu.DropdownMenuItem
													key={option}
													onSelect={() => setView(option)}
													className="justify-between"
												>
													{t(`calendar.${option}` as TranslationKey)}
													{view === option && (
														<Check className="size-4 text-signal" />
													)}
												</DropdownMenu.DropdownMenuItem>
											))}
										</DropdownMenu.DropdownMenuGroup>
									</DropdownMenu.DropdownMenuContent>
								</DropdownMenu.DropdownMenuPortal>
							</DropdownMenu.DropdownMenu>
							<Tabs
								value={view}
								onValueChange={(value) => setView(value as CalendarView)}
								className="max-md:hidden"
							>
								<TabsList>
									{(["week", "day"] as const).map((option) => (
										<TabsTrigger key={option} value={option}>
											{t(`calendar.${option}` as TranslationKey)}
										</TabsTrigger>
									))}
								</TabsList>
							</Tabs>
							<Button
								disabled={pendingAction !== null}
								onClick={() => openNewEvent()}
								size="lg"
								float="mobile"
								className="ml-1 max-md:ml-0"
							>
								<Plus data-icon="inline-start" />
								{t("calendar.newEvent")}
							</Button>
						</div>
					</div>,
					headerTarget
				)}
			<UpcomingSidebar events={events} onSelect={editEvent} />

			<section
				aria-busy={loading}
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-t-lg bg-card"
			>
				<div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
					<div
						className={clsx(
							"w-full",
							view === "week" ? "min-w-190" : "min-w-90"
						)}
					>
						<div
							className={clsx(
								"sticky top-0 z-30 grid h-14 border-b border-border bg-card",
								"grid-cols-(--layout-columns)"
							)}
							style={
								{
									"--layout-columns": `64px repeat(${days.length}, minmax(0, 1fr))`,
								} as React.CSSProperties
							}
						>
							<div />
							{days.map((day) => (
								<div
									key={dateKey(day)}
									className={`border-l border-border px-3 py-2 text-xs ${dateKey(day) === dateKey(today) ? "text-signal" : "text-foreground/80"}`}
								>
									{formatUserDate(day, { weekday: "short" })}
									<span className="block text-2xl font-medium">
										{formatUserDate(day, { day: "numeric" })}
									</span>
								</div>
							))}
						</div>
						<div
							className={clsx(
								"grid",
								"h-(--layout-height) grid-cols-(--layout-columns)"
							)}
							style={
								{
									"--layout-columns": `64px repeat(${days.length}, minmax(0, 1fr))`,
									"--layout-height": layoutLength(
										(CALENDAR_END_HOUR - CALENDAR_START_HOUR) *
											CALENDAR_HOUR_HEIGHT
									),
								} as React.CSSProperties
							}
						>
							<div className="relative">
								{Array.from(
									{ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
									(_, index) => (
										<span
											key={index}
											className={clsx(
												`absolute right-3 text-xs text-foreground/80 ${index === 0 ? "" : "-translate-y-1/2"}`,
												"top-(--layout-top)"
											)}
											style={
												{
													"--layout-top": layoutLength(
														index * CALENDAR_HOUR_HEIGHT
													),
												} as React.CSSProperties
											}
										>
											{index % 2 === 0
												? null
												: formatHour(CALENDAR_START_HOUR + index)}
										</span>
									)
								)}
							</div>
							{days.map((day) => (
								<div
									key={dateKey(day)}
									className={clsx(
										"relative border-l border-border",
										"bg-(image:--layout-image) bg-size-(--layout-background-size)"
									)}
									onDragOver={(event) => {
										if (!draggedEvent) {
											return;
										}
										event.preventDefault();
										event.dataTransfer.dropEffect = "move";
										const start = dropStartForPosition(
											day,
											event.clientY -
												event.currentTarget.getBoundingClientRect().top -
												dragOffsetPixels.current
										);
										const end = new Date(
											start.getTime() +
												new Date(draggedEvent.endsAt).getTime() -
												new Date(draggedEvent.startsAt).getTime()
										);
										setDragPreview((current) =>
											current?.eventId === draggedEvent.id &&
											dateKey(current.day) === dateKey(day) &&
											current.startsAt.getTime() === start.getTime()
												? current
												: {
														day,
														endsAt: end,
														eventId: draggedEvent.id,
														startsAt: start,
													}
										);
									}}
									onDrop={(event) => {
										event.preventDefault();
										if (draggedEvent) {
											void moveEvent(
												draggedEvent,
												day,
												event.clientY -
													event.currentTarget.getBoundingClientRect().top -
													dragOffsetPixels.current
											);
										}
									}}
									style={
										{
											"--layout-background-size": `100% ${CALENDAR_HOUR_HEIGHT}px`,
											"--layout-image":
												"linear-gradient(to bottom, transparent calc(100% - 1px), var(--border) calc(100% - 1px))",
										} as React.CSSProperties
									}
								>
									<Button
										variant="ghost"
										type="button"
										aria-label={t("calendar.addEventOn", {
											date: formatUserDate(day, { dateStyle: "short" }),
										})}
										onClick={(event) =>
											openNewEvent(
												day,
												dropStartForPosition(day, event.nativeEvent.offsetY)
											)
										}
										className="absolute inset-0 z-0 cursor-crosshair"
									/>
									<DayEvents
										day={day}
										events={events}
										currentTime={currentTime}
										busy={busy}
										activeEventId={activeEventId}
										onEdit={onEditEvent}
										onDragStart={onEventDragStart}
										onDragEnd={onEventDragEnd}
										onResizeStart={onResizeStart}
										onResizeMove={onResizeMove}
										onResizeEnd={onResizeEnd}
										onResizeCancel={onResizeCancel}
									/>
									{dragPreview &&
										previewEvent &&
										previewPosition &&
										dateKey(dragPreview.day) === dateKey(day) && (
											<div
												className={clsx(
													`pointer-events-none absolute right-1 left-1 z-20 rounded-lg border-2 border-dashed border-background ${new Date(previewEvent.endsAt).getTime() <= currentTime ? PAST_EVENT_COLOR_CLASSES[normalizeCalendarColor(previewEvent.color)] : EVENT_COLOR_CLASSES[normalizeCalendarColor(previewEvent.color)]}`,
													"top-(--layout-top) h-(--layout-height)"
												)}
												style={
													{
														"--layout-height": layoutLength(
															previewPosition.height
														),
														"--layout-top": layoutLength(previewPosition.top),
													} as React.CSSProperties
												}
											>
												<span className="absolute top-0 left-1 z-10 rounded bg-primary px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-primary-foreground">
													{formatEventRange(previewEvent)}
												</span>
												{previewPosition.height >= 50 && (
													<span className="block truncate px-2 pt-6 text-xs font-semibold">
														{previewEvent.title}
													</span>
												)}
											</div>
										)}
									{dateKey(day) === dateKey(now) && (
										<div
											aria-hidden="true"
											className={clsx(
												"pointer-events-none absolute inset-x-0 z-30",
												"top-(--layout-top)"
											)}
											style={
												{
													"--layout-top": layoutLength(
														currentTimePosition(now)
													),
												} as React.CSSProperties
											}
										>
											<div className="h-0.5 w-full bg-signal" />
											<div className="absolute -top-1.25 -left-1.5 size-3 rounded-full bg-signal" />
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			{adding && renderEventEditor()}
		</div>
	);
}
