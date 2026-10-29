"use client";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Globe2, MapPin, Users } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBranding } from "@/components/branding-provider";
import { RouteLoadingBar } from "@/components/route-loading-bar";
import { getDisplayLocale, getUserTimeZone } from "@/lib/time/utils";
import type { BookingSlot, PublicBookingEvent } from "../types";
import { bookingTimeZones, calendarDays, formatCalendarDate, localDateForSlot, moveMonth, readBookingPageSelection, submitPublicBooking, writeBookingPageSelection } from "./utils";
import { BookingDetailSkeleton } from "./booking-detail-skeleton";

export default function PublicBookingEventPage() {
	const { t } = useLanguage();
	const branding = useBranding();
	const params = useParams();
	const userId = typeof params.userId === "string" ? params.userId : undefined;
	const eventId = typeof params.eventId === "string" ? params.eventId : undefined;
	const username = typeof params.username === "string" ? params.username : undefined;
	const slug = typeof params.slug === "string" ? params.slug : undefined;
	const identifier = slug ?? eventId ?? "";
	const endpoint = `/api/public/booking/${encodeURIComponent(identifier)}${username ? `?username=${encodeURIComponent(username)}` : ""}`;
	const [event, setEvent] = useState<PublicBookingEvent | null>(null);
	const [hostName, setHostName] = useState("");
	const [slots, setSlots] = useState<BookingSlot[]>([]);
	const [timeZone, setTimeZone] = useState("UTC");
	const [month, setMonth] = useState("");
	const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
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
	const availableDates = [...slotsByDate.keys()].sort();
	const todayDate = localDateForSlot({ startsAt: new Date().toISOString(), endsAt: "", localDate: "", time: "" }, timeZone);
	const visibleMonth = month || localDateForSlot({ startsAt: new Date().toISOString(), endsAt: "", localDate: "", time: "" }, timeZone).slice(0, 7);
	const firstMonth = availableDates[0]?.slice(0, 7);
	const lastMonth = availableDates.at(-1)?.slice(0, 7);
	const timeZones = useMemo(() => event ? bookingTimeZones(event.timeZone, timeZone) : [], [event, timeZone]);

	useEffect(() => {
		function restoreSelection() {
			const selection = readBookingPageSelection(window.location.search);
			const zone = selection.timeZone ?? getUserTimeZone();
			const viewerToday = localDateForSlot({ startsAt: new Date().toISOString(), endsAt: "", localDate: "", time: "" }, zone);
			const slot = slots.find((item) => item.startsAt === selection.slotStartsAt) ?? null;
			const date = slot ? localDateForSlot(slot, zone) : selection.date ?? viewerToday;
			setTimeZone(zone);
			setSelectedDate(date);
			setSelectedSlot(slot);
			setMonth(date.slice(0, 7));
			if (!loading || !selection.slotStartsAt) {
				if (selection.date !== date || (new URLSearchParams(window.location.search).has("slot") && !slot) || !selection.timeZone) writeBookingPageSelection(date, slot?.startsAt ?? null, zone, true);
			}
		}
		restoreSelection();
		window.addEventListener("popstate", restoreSelection);
		return () => window.removeEventListener("popstate", restoreSelection);
	}, [slots, loading]);

	useEffect(() => {
		let active = true;
		void fetch(endpoint).then(async (response) => {
			if (!response.ok) throw new Error();
			return response.json() as Promise<{ event: PublicBookingEvent; hostName: string; slots: BookingSlot[] }>;
		}).then((data) => {
			if (!active) return;
			if (userId && data.event.userId !== userId) throw new Error();
			setEvent(data.event);
			setHostName(data.hostName);
			setSlots(data.slots);
		}).catch(() => { if (active) setError(t("public.unavailable")); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [endpoint, userId, t]);

	async function book() {
		if (!selectedSlot) return;
		setSubmitting(true);
		setError("");
		try {
			await submitPublicBooking(endpoint, selectedSlot.startsAt, name, email, guestEmails, notes);
			setDone(true);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : t("public.bookFailed"));
		} finally { setSubmitting(false); }
	}

	return <main className="page-transition-enter min-h-dvh bg-sidebar p-4 text-foreground max-sm:px-0 max-sm:pb-0 sm:px-6 lg:h-dvh lg:overflow-hidden lg:pb-0">
		<div className="mx-auto max-w-[1500px] lg:flex lg:h-full lg:min-h-0 lg:flex-col">
			{loading && <RouteLoadingBar />}
			{selectedSlot && !done ? <Button variant="ghost" type="button" onClick={() => { setSelectedSlot(null); setError(""); writeBookingPageSelection(selectedDate, null, timeZone, true); }} className= "mb-5 inline-flex items-center gap-2 self-start text-sm max-sm:ml-4 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"><ArrowLeft data-icon="inline-start" />{t("public.backToCalendar")}</Button> : <Link href={username ? `/c/${username}` : `/book/${userId}`} className="mb-5 inline-flex items-center gap-2 self-start text-sm text-muted-foreground hover:text-signal max-sm:ml-4"><ArrowLeft className="size-4" />{t("public.allMeetings")}</Link>}
			{loading ? <BookingDetailSkeleton /> : !event ? <p className="rounded-2xl bg-card p-8 text-sm text-muted-foreground shadow-sm">{error}</p> :
				<div className={`page-transition-enter grid overflow-hidden rounded-t-3xl bg-card shadow-sm lg:min-h-0 lg:flex-1 ${selectedSlot || done ? "lg:grid-cols-[minmax(260px,1fr)_minmax(420px,2fr)]" : "lg:grid-cols-[minmax(240px,.95fr)_minmax(380px,1.65fr)_minmax(240px,.95fr)]"}`}>
					<aside className="min-w-0 border-b border-border p-7 max-sm:p-5 sm:p-9 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 flex flex-col border-r">
						<h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>

						{event.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{event.description}</p>}

						<div className="mt-4 flex flex-col gap-5 text-sm font-medium text-muted-foreground border-t border-border pt-4">
							<p className="flex items-start gap-3"><Clock3 size={18} className="shrink-0 text-muted-foreground" />{t("public.minutes", { count: event.durationMinutes })}</p>
							{event.location && <p className="flex items-start gap-3"><MapPin size={18} className="shrink-0 text-muted-foreground" />{event.location}</p>}
							{selectedSlot && <><p className="flex items-start gap-3"><CalendarDays size={18} className="shrink-0 text-muted-foreground" /><span>{new Intl.DateTimeFormat(getDisplayLocale(), { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(selectedSlot.startsAt))} – {new Intl.DateTimeFormat(getDisplayLocale(), { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(selectedSlot.endsAt))}, {new Intl.DateTimeFormat(getDisplayLocale(), { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone }).format(new Date(selectedSlot.startsAt))}</span></p><p className="flex items-start gap-3"><Globe2 size={18} className="shrink-0 text-muted-foreground" />{timeZone.replaceAll("_", " ")}</p></>}
							{hostName && <p className="flex items-start gap-3"><Users size={18} className="shrink-0 text-muted-foreground" /><span>{hostName}</span></p>}

						</div>


						<span className="flex-1 max-sm:hidden" />
						<div className="mb-4 max-w-48"><LanguageSelector /></div>
						<div className="flex min-w-0 items-center gap-3 max-sm:order-first max-sm:mb-5">

							<img src={branding.iconUrl} width={24} height={24} alt={branding.appName} />

							<span className="truncate font-semibold">{branding.appName}</span>
						</div>
					</aside>
					{done ? <section className="flex min-h-0 flex-col items-center justify-center px-8 py-20 text-center"><div className="mb-5 flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700"><Check className="size-7" /></div><h2 className="text-2xl font-semibold">{t("public.booked")}</h2><p className="mt-3 text-sm text-muted-foreground">{t("public.scheduledFor", { when: selectedSlot ? new Intl.DateTimeFormat(getDisplayLocale(), { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date(selectedSlot.startsAt)) : "" })}</p></section> : selectedSlot ?
						<form onSubmit={(formEvent) => { formEvent.preventDefault(); void book(); }} className="page-transition-enter min-h-0 flex flex-col gap-6 overflow-y-auto p-7 max-sm:p-5 sm:p-10">
							<FieldGroup><h2 className="text-2xl font-medium">{t("public.enterDetails")}</h2>
							<Field className="block text-sm font-medium text-foreground/80"><FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-0">{t("public.name")} <span aria-hidden="true">*</span></FieldLabel><Input id="apps-field-srcappbookuserdeventdpagetsx-0" required value={name} onChange={(input) => setName(input.target.value)} maxLength={120} autoComplete="name" className="mt-2" /></Field>
							<Field className="block text-sm font-medium text-foreground/80"><FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-1">{t("public.email")} <span aria-hidden="true">*</span></FieldLabel><Input id="apps-field-srcappbookuserdeventdpagetsx-1" required type="email" value={email} onChange={(input) => setEmail(input.target.value)} maxLength={254} autoComplete="email" className="mt-2" /></Field>
							{showGuests ? <Field className="block text-sm font-medium text-foreground/80"><FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-2">{t("public.guestEmails")} <span className="font-normal text-muted-foreground">{t("public.commaSeparated")}</span></FieldLabel><Input id="apps-field-srcappbookuserdeventdpagetsx-2" type="text" value={guestEmails} onChange={(input) => setGuestEmails(input.target.value)} placeholder="guest@example.com" className="mt-2" /></Field> : <Button type="button" variant="outline" onClick={() => setShowGuests(true)} className= " [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">{t("public.addGuests")}</Button>}
							<Field className="block text-sm font-medium text-foreground/80"><FieldLabel htmlFor="apps-field-srcappbookuserdeventdpagetsx-3">{t("public.notes")}</FieldLabel><Textarea id="apps-field-srcappbookuserdeventdpagetsx-3" value={notes} onChange={(input) => setNotes(input.target.value)} maxLength={2000} rows={4} className="mt-2 resize-y" /></Field>
							{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
							<Button type="submit" disabled={submitting || !name.trim() || !email.trim()} className= "h-11 px-7 text-sm font-medium [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">{submitting ? t("public.booking") : t("public.schedule")}</Button>
						</FieldGroup></form> : <>
							<section className="page-transition-enter min-w-0 border-b border-border lg:min-h-0 lg:overflow-y-auto">
								<div className="mx-auto md:mt-8 my-2 flex max-w-[440px] items-center justify-between gap-3 px-5"><h3 className="text-lg font-semibold flex-1">{formatCalendarDate(`${visibleMonth}-01`, { month: "long", year: "numeric" })}</h3>
									<Button variant="ghost" type="button" aria-label={t("public.prevMonth")} disabled={!firstMonth || moveMonth(visibleMonth, -1) < firstMonth} onClick={() => setMonth(moveMonth(visibleMonth, -1))} className= "flex size-9 items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-30 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"><ChevronLeft data-icon="inline-start" /></Button>
									<Button variant="ghost" type="button" aria-label={t("public.nextMonth")} disabled={!lastMonth || moveMonth(visibleMonth, 1) > lastMonth} onClick={() => setMonth(moveMonth(visibleMonth, 1))} className= "flex size-9 items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-30 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"><ChevronRight data-icon="inline-start" /></Button>
								</div>
								<div className="mx-auto mt-6 grid max-w-[440px] grid-cols-7 max-sm:px-5 text-center text-sm text-muted-foreground">{t("public.weekdayHeads").split("|").map((head) => <span key={head}>{head}</span>)}</div>
								<div className="mx-auto mt-2 mb-6 grid max-w-[440px] grid-cols-7 max-sm:px-5">{calendarDays(visibleMonth).map((date, index) => <div key={date || `blank-${index}`} className="aspect-square min-w-0">{date && <Button variant="ghost" type="button" disabled={!slotsByDate.has(date) && date !== todayDate} onClick={() => { setSelectedDate(date); setError(""); writeBookingPageSelection(date, null, timeZone); }} aria-label={`${formatCalendarDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${date === todayDate ? t("public.today") : ""}${slotsByDate.has(date) ? t("public.availableTimes", { count: slotsByDate.get(date)?.length }) : t("public.noTimesDay")}`} aria-current={date === todayDate ? "date" : undefined} aria-pressed={selectedDate === date} className={`flex h-full w-full min-w-0 items-center justify-center rounded-lg p-0 text-base ${selectedDate === date ? "bg-primary text-primary-foreground" : slotsByDate.has(date) || date === todayDate ? "text-signal hover:bg-signal-soft" : "cursor-not-allowed text-muted-foreground/70"}`}><span className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ${selectedDate === date ? "font-semibold" : slotsByDate.has(date) ? "bg-signal-soft font-medium" : ""} ${date === todayDate && selectedDate !== date ? "ring-2 ring-ring ring-offset-2" : ""}`}>{Number(date.slice(-2))}{date === todayDate && selectedDate === date && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-card" />}</span></Button>}</div>)}
								</div>

								<div className="flex min-w-0 items-center gap-2 w-full pl-3 pr-2 max-sm:px-5 text-sm text-muted-foreground focus-within:border-ring max-w-[440px] my-4 mx-auto">
									<Globe2 aria-hidden="true" className="size-4 shrink-0" />
									<label htmlFor="booking-time-zone" className="shrink-0 whitespace-nowrap">{t("public.timeZone")}</label>
									<NativeSelect containerClassName="min-w-0 w-full" id="booking-time-zone" value={timeZone} onChange={(input) => { const nextToday = localDateForSlot({ startsAt: new Date().toISOString(), endsAt: "", localDate: "", time: "" }, input.target.value); setTimeZone(input.target.value); setSelectedDate(nextToday); setMonth(nextToday.slice(0, 7)); writeBookingPageSelection(nextToday, null, input.target.value); }} className="ml-auto h-9 min-w-0 max-w-full flex-1 truncate border-0 bg-transparent px-1 text-sm text-foreground/80 shadow-none outline-none text-right">{timeZones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</NativeSelect>
								</div>
								{slots.length === 0 && <p className="mt-6 text-sm text-muted-foreground">{t("public.noTimes60")}</p>}
							</section>
							{selectedDate && <section key={selectedDate} className="page-transition-enter flex min-h-0 flex-col p-7 max-sm:p-5 sm:p-9 lg:overflow-hidden"><h3 className="mb-6 shrink-0 text-lg font-semibold">{formatCalendarDate(selectedDate, { weekday: "long", month: "short", day: "numeric" })}</h3><div className="min-h-0 max-h-[50dvh] flex-1 flex flex-col gap-3 overflow-y-auto pr-1 lg:max-h-none">{(slotsByDate.get(selectedDate) ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("public.noTimesDate")}</p> : (slotsByDate.get(selectedDate) ?? []).map((slot) => <Button variant="ghost" type="button" key={slot.startsAt} onClick={() => { setSelectedSlot(slot); setError(""); writeBookingPageSelection(selectedDate, slot.startsAt, timeZone); }} className= "w-full rounded-md border px-4 py-3 text-center text-sm font-medium hover:border-ring [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">{new Intl.DateTimeFormat(getDisplayLocale(), { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(slot.startsAt))}</Button>)}</div></section>}
						</>}
				</div>}
		</div>
	</main>;
}
