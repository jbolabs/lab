"use client";

import { ArrowRight, Clock3, MapPin } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/brand";
import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import { LanguageSelector } from "@/components/language-selector";
import { RouteLoadingBar } from "@/components/route-loading-bar";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { cn as scopeLayoutClasses } from "@/lib/utils";

import { BookingListSkeleton } from "./booking-list-skeleton";
import type { PublicBookingEvent } from "./types";

export default function PublicBookingListPage() {
	const { t } = useLanguage();
	const branding = useBranding();
	const params = useParams();
	const userId = typeof params.userId === "string" ? params.userId : undefined;
	const username =
		typeof params.username === "string" ? params.username : undefined;
	const query = username
		? `username=${encodeURIComponent(username)}`
		: `userId=${encodeURIComponent(userId ?? "")}`;
	const [name, setName] = useState("");
	const [events, setEvents] = useState<PublicBookingEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	useEffect(() => {
		let active = true;
		void fetch(`/api/public/booking?${query}`)
			.then((response) => {
				if (!response.ok) {
					throw new Error("Request failed");
				}
				return response.json() as Promise<{
					name: string;
					events: PublicBookingEvent[];
				}>;
			})
			.then((data) => {
				if (active) {
					setName(data.name);
					setEvents(data.events);
				}

				return null;
			})
			.catch(() => {
				if (active) {
					setError(t("public.listUnavailable"));
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
	}, [query, t]);
	return (
		<main
			className={scopeLayoutClasses(
				"page-transition-enter flex min-h-dvh flex-col bg-background p-5 text-foreground sm:p-8 lg:pt-16",
				"pb-safe-5"
			)}
		>
			{loading && <RouteLoadingBar />}
			<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
				<div className="mb-10">
					<Wordmark />
				</div>
				<PageHeader className="mb-8">
					<PageHeaderText>
						<PageTitle>
							{name
								? t("public.bookMeetingWith", { name })
								: t("public.bookMeeting")}
						</PageTitle>
						<PageDescription>{t("public.chooseMeeting")}</PageDescription>
					</PageHeaderText>
				</PageHeader>
				{(() => {
					if (loading) {
						return <BookingListSkeleton />;
					}
					if (error) {
						return (
							<Empty className="flex-none">
								<EmptyDescription>{error}</EmptyDescription>
							</Empty>
						);
					}
					if (events.length === 0) {
						return (
							<Empty className="flex-none">
								<EmptyDescription>{t("public.noMeetings")}</EmptyDescription>
							</Empty>
						);
					}
					return (
						<div className="page-transition-enter flex flex-col gap-3">
							{events.map((event) => (
								<Link
									key={event.id}
									href={
										username
											? `/c/${username}/${event.slug}`
											: `/book/${userId}/${event.id}`
									}
									className="group flex items-center gap-4 rounded-lg border bg-card p-5 shadow-sm transition-colors outline-none hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
								>
									<div className="min-w-0 flex-1">
										<h2 className="font-semibold group-hover:text-signal">
											{event.name}
										</h2>
										{event.description && (
											<p className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
												{event.description}
											</p>
										)}
										<p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
											<span className="inline-flex items-center gap-1">
												<Clock3 className="size-4" />
												{t("public.minutesLong", {
													count: event.durationMinutes,
												})}
											</span>
											{event.location && (
												<span className="inline-flex items-center gap-1">
													<MapPin className="size-4" />
													{event.location}
												</span>
											)}
										</p>
									</div>
									<ArrowRight className="size-5 text-muted-foreground/70 group-hover:text-signal" />
								</Link>
							))}
						</div>
					);
				})()}
				<div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-3 pt-10 text-foreground/80">
					<div className="w-44">
						<LanguageSelector />
					</div>
					{/* oxlint-disable-next-line next/no-img-element -- Runtime branding and avatar API URLs are served directly; Workers has no configured image optimizer. */}
					<img
						src={branding.iconUrl}
						width={24}
						height={24}
						alt={branding.appName}
					/>
					<span className="truncate font-semibold">{branding.appName}</span>
				</div>
			</div>
		</main>
	);
}
