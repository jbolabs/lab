"use client";
import {
	ArrowLeft,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	Clock3,
	Globe2,
	MapPin,
	Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Link from "@/components/app-link";
import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import { LanguageSelector } from "@/components/language-selector";
import { RouteLoadingBar } from "@/components/route-loading-bar";
import { Button } from "@/components/ui/button";
import {
	FieldGroup,
	Field,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageTitle } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { requireSuccessfulResponse, withCleanup } from "@/lib/async-cleanup";
import { useParams } from "@/lib/navigation";
import { getDisplayLocale, getUserTimeZone } from "@/lib/time/utils";
import { cn } from "@/lib/utils";

import type { BookingSlot, PublicBookingEvent } from "../types";
import { BookingDetailSkeleton } from "./booking-detail-skeleton";
import {
	bookingTimeZones,
	calendarDays,
	formatCalendarDate,
	localDateForSlot,
	moveMonth,
	readBookingPageSelection,
	submitPublicBooking,
	writeBookingPageSelection,
} from "./utils";

export default function PublicBookingEventPage() {
	const { t } = useLanguage();
	const branding = useBranding();
	const params = useParams();
	const userId = typeof params.userId === "string" ? params.userId : undefined;
	const eventId =
		typeof params.eventId === "string" ? params.eventId : undefined;
	const username =
		typeof params.username === "string" ? params.username : undefined;
	const slug = typeof params.slug === "string" ? params.slug : undefined;
	const identifier = slug ?? eventId ?? "";
	const endpoint = `/api/public/booking/${encodeURIComponent(identifier)}${username ? `?username=${encodeURIComponent(username)}` : ""}`;
	const [event, setEvent] = useState<PublicBookingEvent | null>(null);
	const [hostName, setHostName] = useState("");
	const [slots, setSlots] = useState<BookingSlot[]>([]);
	const [timeZone, setTimeZone] = useState("UTC");
	const [month, setMonth] = useState("");
	const [selectedDate, setSelectedDate] = useState(() =>
		new Date().toISOString().slice(0, 10)
	);
	const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [guestEmails, setGuestEmails] = useState("");
	const [showGuests, setShowGuests] = useState(false);
	const [notes, setNotes] = useState("");
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState("");
	const slotsByDate = useMemo(() => {
		const grouped = new Map<string, BookingSlot[]>();
		for (const slot of slots) {
			const date = localDateForSlot(slot, timeZone);
			grouped.set(date, [...(grouped.get(date) ?? []), slot]);
		}
		return grouped;
	}, [slots, timeZone]);
	const availableDates = [...slotsByDate.keys()].toSorted();
	const [todayIso, setTodayIso] = useState(() => new Date().toISOString());
	void setTodayIso;
	const todayDate = localDateForSlot(
		{ endsAt: "", localDate: "", startsAt: todayIso, time: "" },
		timeZone
	);
	const visibleMonth =
		month ||
		localDateForSlot(
			{
				endsAt: "",
				localDate: "",
				startsAt: todayIso,
				time: "",
			},
			timeZone
		).slice(0, 7);
	const firstMonth = availableDates[0]?.slice(0, 7);
	const lastMonth = availableDates.at(-1)?.slice(0, 7);
	const timeZones = useMemo(
		() => (event ? bookingTimeZones(event.timeZone, timeZone) : []),
		[event, timeZone]
	);

	useEffect(() => {
		function restoreSelection() {
			const selection = readBookingPageSelection(window.location.search);
			const zone = selection.timeZone ?? getUserTimeZone();
			const viewerToday = localDateForSlot(
				{
					endsAt: "",
					localDate: "",
					startsAt: todayIso,
					time: "",
				},
				zone
			);
			const slot =
				slots.find((item) => item.startsAt === selection.slotStartsAt) ?? null;
			const date = slot
				? localDateForSlot(slot, zone)
				: (selection.date ?? viewerToday);
			setTimeZone(zone);
			setSelectedDate(date);
			setSelectedSlot(slot);
			setMonth(date.slice(0, 7));
			if (
				(!loading || !selection.slotStartsAt) &&
				(selection.date !== date ||
					(new URLSearchParams(window.location.search).has("slot") && !slot) ||
					!selection.timeZone)
			) {
				writeBookingPageSelection(date, slot?.startsAt ?? null, zone, true);
			}
		}
		restoreSelection();
		window.addEventListener("popstate", restoreSelection);
		return () => window.removeEventListener("popstate", restoreSelection);
	}, [slots, loading, todayIso]);

	useEffect(() => {
		let active = true;
		void fetch(endpoint)
			.then((response) => {
				requireSuccessfulResponse(response, "Request failed");
				return response.json() as Promise<{
					event: PublicBookingEvent;
					hostName: string;
					slots: BookingSlot[];
				}>;
			})
			.then((data) => {
				if (!active) {
					return;
				}
				if (userId && data.event.userId !== userId) {
					throw new Error("Request failed");
				}
				setEvent(data.event);
				setHostName(data.hostName);
				setSlots(data.slots);

				return null;
			})
			.catch(() => {
				if (active) {
					setError(t("public.unavailable"));
				}
			})
			.finally(() => {
				if (active) {
					setLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [endpoint, userId, t]);

	function book() {
		if (!selectedSlot) {
			return;
		}
		setSubmitting(true);
		setError("");
		return withCleanup(
			async () => {
				try {
					await submitPublicBooking(
						endpoint,
						selectedSlot.startsAt,
						name,
						email,
						guestEmails,
						notes
					);
					setDone(true);
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("public.bookFailed")
					);
				}
			},
			() => {
				setSubmitting(false);
			}
		);
	}
	return (
		<main className="page-transition-enter min-h-dvh bg-sidebar p-4 text-foreground max-sm:px-0 max-sm:pb-0 sm:px-6 lg:h-dvh lg:overflow-hidden lg:pb-0">
			<div className="mx-auto max-w-375 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
				{loading && <RouteLoadingBar />}
				{selectedSlot && !done ? (
					<Button
						variant="ghost"
						type="button"
						onClick={() => {
							setSelectedSlot(null);
							setError("");
							writeBookingPageSelection(selectedDate, null, timeZone, true);
						}}
						className="mb-5 self-start max-sm:ml-4"
					>
						<ArrowLeft data-icon="inline-start" />
						{t("public.backToCalendar")}
					</Button>
				) : (
					<Link
						href={username ? `/c/${username}` : `/book/${userId}`}
						className="mb-5 inline-flex items-center gap-2 self-start text-sm text-muted-foreground hover:text-signal max-sm:ml-4"
					>
						<ArrowLeft className="size-4" />
						{t("public.allMeetings")}
					</Link>
				)}
				{(() => {
					if (loading) {
						return <BookingDetailSkeleton />;
					}
					if (event) {
						return (
							<div
								className={cn(
									"page-transition-enter grid overflow-hidden rounded-t-lg border border-b-0 bg-card shadow-sm lg:min-h-0 lg:flex-1",
									selectedSlot || done
										? "lg:grid-cols-[minmax(260px,1fr)_minmax(420px,2fr)]"
										: "lg:grid-cols-[minmax(240px,.95fr)_minmax(380px,1.65fr)_minmax(240px,.95fr)]"
								)}
							>
								<aside className="flex min-w-0 flex-col border-r border-b border-border p-7 max-sm:p-5 sm:p-9 lg:min-h-0 lg:overflow-y-auto lg:border-b-0">
									<PageTitle size="sm">{event.name}</PageTitle>

									{event.description && (
										<p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
											{event.description}
										</p>
									)}

									<div className="mt-4 flex flex-col gap-5 border-t border-border pt-4 text-sm font-medium text-muted-foreground">
										<p className="flex items-start gap-3">
											<Clock3
												size={18}
												className="shrink-0 text-muted-foreground"
											/>
											{t("public.minutes", { count: event.durationMinutes })}
										</p>
										{event.location && (
											<p className="flex items-start gap-3">
												<MapPin
													size={18}
													className="shrink-0 text-muted-foreground"
												/>
												{event.location}
											</p>
										)}
										{selectedSlot && (
											<>
												<p className="flex items-start gap-3">
													<CalendarDays
														size={18}
														className="shrink-0 text-muted-foreground"
													/>
													<span>
														{new Intl.DateTimeFormat(getDisplayLocale(), {
															hour: "numeric",
															hourCycle: "h23",
															minute: "2-digit",
															timeZone,
														}).format(new Date(selectedSlot.startsAt))}{" "}
														–{" "}
														{new Intl.DateTimeFormat(getDisplayLocale(), {
															hour: "numeric",
															hourCycle: "h23",
															minute: "2-digit",
															timeZone,
														}).format(new Date(selectedSlot.endsAt))}
														,{" "}
														{new Intl.DateTimeFormat(getDisplayLocale(), {
															day: "numeric",
															month: "long",
															timeZone,
															weekday: "long",
															year: "numeric",
														}).format(new Date(selectedSlot.startsAt))}
													</span>
												</p>
												<p className="flex items-start gap-3">
													<Globe2
														size={18}
														className="shrink-0 text-muted-foreground"
													/>
													{timeZone.replaceAll("_", " ")}
												</p>
											</>
										)}
										{hostName && (
											<p className="flex items-start gap-3">
												<Users
													size={18}
													className="shrink-0 text-muted-foreground"
												/>
												<span>{hostName}</span>
											</p>
										)}
									</div>

									<span className="flex-1 max-sm:hidden" />
									<div className="mb-4 max-w-48">
										<LanguageSelector />
									</div>
									<div className="flex min-w-0 items-center gap-3 max-sm:order-first max-sm:mb-5">
										<img
											src={branding.iconUrl}
											width={24}
											height={24}
											alt={branding.appName}
										/>

										<span className="truncate font-semibold">
											{branding.appName}
										</span>
									</div>
								</aside>
								{(() => {
									if (done) {
										return (
											<section className="flex min-h-0 flex-col items-center justify-center px-8 py-20 text-center">
												<div className="mb-5 flex size-14 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
													<Check className="size-7" />
												</div>
												<h2 className="text-2xl font-semibold">
													{t("public.booked")}
												</h2>
												<p className="mt-3 text-sm text-muted-foreground">
													{t("public.scheduledFor", {
														when: selectedSlot
															? new Intl.DateTimeFormat(getDisplayLocale(), {
																	dateStyle: "full",
																	timeStyle: "short",
																	timeZone,
																}).format(new Date(selectedSlot.startsAt))
															: "",
													})}
												</p>
											</section>
										);
									}
									if (selectedSlot) {
										return (
											<form
												onSubmit={(formEvent) => {
													formEvent.preventDefault();
													void book();
												}}
												className="page-transition-enter flex min-h-0 flex-col gap-6 overflow-y-auto p-7 max-sm:p-5 sm:p-10"
											>
												<FieldGroup>
													<h2 className="text-2xl font-medium">
														{t("public.enterDetails")}
													</h2>
													<Field>
														<FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-0">
															{t("public.name")}{" "}
															<span aria-hidden="true">*</span>
														</FieldLabel>
														<Input
															id="apps-field-srcappbookuserdeventdpagetsx-0"
															required
															value={name}
															onChange={(input) => setName(input.target.value)}
															maxLength={120}
															autoComplete="name"
														/>
													</Field>
													<Field>
														<FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-1">
															{t("public.email")}{" "}
															<span aria-hidden="true">*</span>
														</FieldLabel>
														<Input
															id="apps-field-srcappbookuserdeventdpagetsx-1"
															required
															type="email"
															value={email}
															onChange={(input) => setEmail(input.target.value)}
															maxLength={254}
															autoComplete="email"
														/>
													</Field>
													{showGuests ? (
														<Field>
															<FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-2">
																{t("public.guestEmails")}{" "}
																<span className="font-normal text-muted-foreground">
																	{t("public.commaSeparated")}
																</span>
															</FieldLabel>
															<Input
																id="apps-field-srcappbookuserdeventdpagetsx-2"
																type="text"
																value={guestEmails}
																onChange={(input) =>
																	setGuestEmails(input.target.value)
																}
																placeholder="guest@example.com"
															/>
														</Field>
													) : (
														<Button
															type="button"
															variant="outline"
															onClick={() => setShowGuests(true)}
															className="self-start"
														>
															{t("public.addGuests")}
														</Button>
													)}
													<Field>
														<FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-3">
															{t("public.notes")}
														</FieldLabel>
														<Textarea
															id="apps-field-srcappbookuserdeventdpagetsx-3"
															value={notes}
															onChange={(input) => setNotes(input.target.value)}
															maxLength={2000}
															rows={4}
															className="resize-y"
														/>
													</Field>
													{error && <FieldError>{error}</FieldError>}
													<Button
														type="submit"
														disabled={
															submitting || !name.trim() || !email.trim()
														}
														size="lg"
													>
														{submitting
															? t("public.booking")
															: t("public.schedule")}
													</Button>
												</FieldGroup>
											</form>
										);
									}
									return (
										<>
											<section className="page-transition-enter min-w-0 border-b border-border lg:min-h-0 lg:overflow-y-auto">
												<div className="mx-auto my-2 flex max-w-110 items-center justify-between gap-3 px-5 md:mt-8">
													<h3 className="flex-1 text-lg font-semibold">
														{formatCalendarDate(`${visibleMonth}-01`, {
															month: "long",
															year: "numeric",
														})}
													</h3>
													<Button
														variant="outline"
														size="icon"
														type="button"
														aria-label={t("public.prevMonth")}
														disabled={
															!firstMonth ||
															moveMonth(visibleMonth, -1) < firstMonth
														}
														onClick={() =>
															setMonth(moveMonth(visibleMonth, -1))
														}
														className=""
													>
														<ChevronLeft data-icon="inline-start" />
													</Button>
													<Button
														variant="outline"
														size="icon"
														type="button"
														aria-label={t("public.nextMonth")}
														disabled={
															!lastMonth ||
															moveMonth(visibleMonth, 1) > lastMonth
														}
														onClick={() => setMonth(moveMonth(visibleMonth, 1))}
														className=""
													>
														<ChevronRight data-icon="inline-start" />
													</Button>
												</div>
												<div className="mx-auto mt-6 grid max-w-110 grid-cols-7 text-center text-sm text-muted-foreground max-sm:px-5">
													{t("public.weekdayHeads")
														.split("|")
														.map((head) => (
															<span key={head}>{head}</span>
														))}
												</div>
												<div className="mx-auto mt-2 mb-6 grid max-w-110 grid-cols-7 max-sm:px-5">
													{calendarDays(visibleMonth).map((date, index) => (
														<div
															key={date || `blank-${index}`}
															className="aspect-square min-w-0"
														>
															{date && (
																<Button
																	variant="ghost"
																	type="button"
																	disabled={
																		!slotsByDate.has(date) && date !== todayDate
																	}
																	onClick={() => {
																		setSelectedDate(date);
																		setError("");
																		writeBookingPageSelection(
																			date,
																			null,
																			timeZone
																		);
																	}}
																	aria-label={`${formatCalendarDate(date, { day: "numeric", month: "long", weekday: "long", year: "numeric" })}${date === todayDate ? t("public.today") : ""}${slotsByDate.has(date) ? t("public.availableTimes", { count: slotsByDate.get(date)?.length }) : t("public.noTimesDay")}`}
																	aria-current={
																		date === todayDate ? "date" : undefined
																	}
																	aria-pressed={selectedDate === date}
																	className={cn(
																		"min-w-0",
																		!(
																			selectedDate === date ||
																			slotsByDate.has(date) ||
																			date === todayDate
																		) && "text-muted-foreground/70"
																	)}
																>
																	<span
																		className={cn(
																			"relative flex size-10 shrink-0 items-center justify-center rounded-full text-base",
																			selectedDate === date
																				? "bg-primary font-semibold"
																				: slotsByDate.has(date) &&
																						"bg-signal-soft font-medium",
																			date === todayDate &&
																				selectedDate !== date &&
																				"ring-2 ring-ring ring-offset-2"
																		)}
																	>
																		{Number(date.slice(-2))}
																		{date === todayDate &&
																			selectedDate === date && (
																				<span
																					aria-hidden="true"
																					className="absolute bottom-1 size-1 rounded-full bg-card"
																				/>
																			)}
																	</span>
																</Button>
															)}
														</div>
													))}
												</div>

												<div className="mx-auto my-4 flex w-full max-w-110 min-w-0 items-center gap-2 pr-2 pl-3 text-sm text-muted-foreground max-sm:px-5">
													<Globe2
														aria-hidden="true"
														className="size-4 shrink-0"
													/>
													<label
														htmlFor="booking-time-zone"
														className="shrink-0 whitespace-nowrap"
													>
														{t("public.timeZone")}
													</label>
													<NativeSelect
														containerClassName="min-w-0 w-full"
														id="booking-time-zone"
														value={timeZone}
														onChange={(input) => {
															const nextToday = localDateForSlot(
																{
																	endsAt: "",
																	localDate: "",
																	startsAt: todayIso,
																	time: "",
																},
																input.target.value
															);
															setTimeZone(input.target.value);
															setSelectedDate(nextToday);
															setMonth(nextToday.slice(0, 7));
															writeBookingPageSelection(
																nextToday,
																null,
																input.target.value
															);
														}}
														className="truncate"
													>
														{timeZones.map((zone) => (
															<option key={zone} value={zone}>
																{zone.replaceAll("_", " ")}
															</option>
														))}
													</NativeSelect>
												</div>
												{slots.length === 0 && (
													<p className="mt-6 text-sm text-muted-foreground">
														{t("public.noTimes60")}
													</p>
												)}
											</section>
											{selectedDate && (
												<section
													key={selectedDate}
													className="page-transition-enter flex min-h-0 flex-col p-7 max-sm:p-5 sm:p-9 lg:overflow-hidden"
												>
													<h3 className="mb-6 shrink-0 text-lg font-semibold">
														{formatCalendarDate(selectedDate, {
															day: "numeric",
															month: "short",
															weekday: "long",
														})}
													</h3>
													<div
														className={cn(
															"flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 lg:max-h-none",
															"max-h-[50dvh]"
														)}
													>
														{(slotsByDate.get(selectedDate) ?? []).length ===
														0 ? (
															<p className="text-sm text-muted-foreground">
																{t("public.noTimesDate")}
															</p>
														) : (
															(slotsByDate.get(selectedDate) ?? []).map(
																(slot) => (
																	<Button
																		type="button"
																		key={slot.startsAt}
																		onClick={() => {
																			setSelectedSlot(slot);
																			setError("");
																			writeBookingPageSelection(
																				selectedDate,
																				slot.startsAt,
																				timeZone
																			);
																		}}
																		variant="outline"
																		size="lg"
																		className="w-full"
																	>
																		{new Intl.DateTimeFormat(
																			getDisplayLocale(),
																			{
																				hour: "numeric",
																				hour12: true,
																				minute: "2-digit",
																				timeZone,
																			}
																		).format(new Date(slot.startsAt))}
																	</Button>
																)
															)
														)}
													</div>
												</section>
											)}
										</>
									);
								})()}
							</div>
						);
					}
					return (
						<p className="rounded-lg border bg-card p-8 text-sm text-muted-foreground shadow-sm">
							{error}
						</p>
					);
				})()}
			</div>
		</main>
	);
}
