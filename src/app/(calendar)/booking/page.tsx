"use client";
import {
	CalendarDays,
	Check,
	Clock3,
	Copy,
	ExternalLink,
	MapPin,
	MoreHorizontal,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useConfirmation } from "@/app/(calendar)/use-confirmation";
import { useLanguage } from "@/components/language-provider";
import { RouteLoadingBarPortal } from "@/components/route-loading-bar-portal";
import { useSidebar } from "@/components/sidebar-state";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import {
	requireActionEntity,
	requireSuccessfulResponse,
	withCleanup,
} from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { getUserTimeZone } from "@/lib/time/utils";
import { cn as clsx } from "@/lib/utils";

import { UpcomingSidebar } from "../upcoming-sidebar";
import { BookingEditor } from "./booking-editor";
import { BookingListSkeleton } from "./booking-list-skeleton";
import { visibleBookingEvents } from "./default-events";
import type { BookingEvent, BookingForm, BookingHost } from "./types";
import {
	availabilityLabel,
	durationLabel,
	emptyBookingForm,
	formFromEvent,
} from "./utils";

export default function BookingsPage() {
	const { t } = useLanguage();
	const { confirm, confirmation } = useConfirmation();
	const { minimal: sidebarMinimal, mobile } = useSidebar();
	const minimal = sidebarMinimal || mobile;
	const [events, setEvents] = useState<BookingEvent[]>([]);
	const [username, setUsername] = useState("");
	const [hosts, setHosts] = useState<BookingHost[]>([]);
	const [canManageHosts, setCanManageHosts] = useState(false);
	const [currentUserId, setCurrentUserId] = useState("");
	const [loading, setLoading] = useState(true);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<BookingForm | null>(null);
	const [panelOpen, setPanelOpen] = useState(false);
	const [saving, setSaving] = useState(false);

	const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
	const listEvents = visibleBookingEvents(
		events,
		currentUserId,
		getUserTimeZone()
	);

	useEffect(() => {
		let active = true;
		void authFetch("/api/booking")
			.then((response) => {
				requireSuccessfulResponse(response, "Request failed");
				return response.json() as Promise<{
					events: BookingEvent[];
					username: string | null;
					currentUser: BookingHost;
					canManageHosts: boolean;
				}>;
			})
			.then(async (data) => {
				if (active) {
					setEvents(data.events);
					setUsername(data.username ?? "");
					setHosts([data.currentUser]);
					setCurrentUserId(data.currentUser.id);
				}
				if (!data.canManageHosts) {
					return;
				}
				const response = await authFetch("/api/accounts");
				if (!response.ok) {
					if (active) {
						toast.error(t("booking.hostListFailed"));
					}
					return;
				}
				const accounts = (await response.json()) as {
					accounts: (BookingHost & { disabled: boolean })[];
				};
				if (active) {
					setHosts([
						data.currentUser,
						...accounts.accounts
							.filter(
								(account) =>
									!account.disabled && account.id !== data.currentUser.id
							)
							.map(({ id, name, email, hasAvatar }) => ({
								email,
								hasAvatar,
								id,
								name,
							})),
					]);
					setCanManageHosts(true);
				}

				return null;
			})
			.catch(() => {
				if (active) {
					toast.error(t("booking.loadFailed"));
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
	}, [t]);

	useEffect(() => {
		if (panelOpen || !form) {
			return;
		}
		const timeout = window.setTimeout(() => {
			setForm(null);
			setEditingId(null);
		}, 320);
		return () => window.clearTimeout(timeout);
	}, [panelOpen, form]);

	function revealPanel() {
		setPanelOpen(false);
		requestAnimationFrame(() =>
			requestAnimationFrame(() => setPanelOpen(true))
		);
	}
	function startCreate() {
		if (!currentUserId) {
			return;
		}
		setEditingId(null);
		setForm(emptyBookingForm(getUserTimeZone(), currentUserId));
		revealPanel();
	}
	function startEdit(event: BookingEvent) {
		setEditingId(event.isTemplate ? null : event.id);
		setForm({
			...formFromEvent(event),
			enabled: event.isTemplate ? true : event.enabled,
		});
		if (!panelOpen) {
			revealPanel();
		}
	}
	function closeEditor() {
		setPanelOpen(false);
	}

	function save() {
		if (!form) {
			return;
		}
		setSaving(true);
		return withCleanup(
			async () => {
				try {
					const response = await authFetch(
						editingId ? `/api/booking/${editingId}` : "/api/booking",
						{
							body: JSON.stringify(form),
							headers: { "Content-Type": "application/json" },
							method: editingId ? "PATCH" : "POST",
						}
					);
					const data = (await response.json()) as {
						event?: BookingEvent;
						error?: string;
					};
					if (!response.ok || !data.event) {
						toast.error(data.error ?? t("booking.saveFailed"));
						return;
					}
					const updatedEvent = data.event;
					setEvents((current) =>
						editingId
							? current.map((item) =>
									item.id === editingId ? updatedEvent : item
								)
							: [...current, updatedEvent]
					);
					closeEditor();
					toast.success(editingId ? t("booking.saved") : t("booking.created"));
				} catch {
					toast.error(t("booking.saveFailed"));
				}
			},
			() => {
				setSaving(false);
			}
		);
	}

	function setEnabled(event: BookingEvent, enabled: boolean) {
		if (event.isTemplate && !enabled) {
			return;
		}
		if (event.isTemplate) {
			setSavingTemplateId(event.id);
		}
		return withCleanup(
			async () => {
				try {
					const response = await authFetch(
						event.isTemplate ? "/api/booking" : `/api/booking/${event.id}`,
						{
							body: JSON.stringify({ ...formFromEvent(event), enabled }),
							headers: { "Content-Type": "application/json" },
							method: event.isTemplate ? "POST" : "PATCH",
						}
					);
					const data = (await response.json()) as {
						event?: BookingEvent;
						error?: string;
					};
					requireSuccessfulResponse(response, data.error);
					const updatedEvent = requireActionEntity(data.event, data.error);
					setEvents((current) =>
						event.isTemplate
							? [...current, updatedEvent]
							: current.map((item) =>
									item.id === event.id ? updatedEvent : item
								)
					);
					if (editingId === event.id && form) {
						setForm({ ...form, enabled });
					}
				} catch {
					toast.error(
						event.isTemplate
							? t("booking.enableFailed")
							: t("booking.updateFailed")
					);
				}
			},
			() => {
				if (event.isTemplate) {
					setSavingTemplateId(null);
				}
			}
		);
	}

	async function remove(event: BookingEvent) {
		if (!(await confirm(t("booking.deleteConfirm", { name: event.name })))) {
			return;
		}
		try {
			const response = await authFetch(`/api/booking/${event.id}`, {
				method: "DELETE",
			});
			requireSuccessfulResponse(response, "Request failed");
			setEvents((current) => current.filter((item) => item.id !== event.id));
			if (editingId === event.id) {
				closeEditor();
			}
		} catch {
			toast.error(t("booking.deleteFailed"));
		}
	}

	async function copyLink(event: BookingEvent) {
		if (!username) {
			toast.error(t("booking.usernameUnavailable"));
			return;
		}
		try {
			await navigator.clipboard.writeText(
				`${window.location.origin}/c/${username}/${event.slug}`
			);
			toast.success(t("booking.linkCopied"));
		} catch {
			toast.error(t("booking.copyFailed"));
		}
	}
	return (
		<div
			className={clsx(
				"flex h-full min-h-0 flex-col bg-sidebar pl-3 transition-all duration-200 ease-in-out motion-reduce:transition-none max-md:pl-0 lg:flex-row",
				minimal ? "gap-0" : "gap-3"
			)}
		>
			{loading && <RouteLoadingBarPortal />}
			{confirmation}
			<UpcomingSidebar />
			<section className="min-h-0 min-w-0 flex-1 overflow-hidden overscroll-contain max-md:rounded-t-lg max-md:bg-card">
				<div className="flex h-full min-h-0 min-w-0">
					<div className="min-w-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain">
						<div className="mx-auto max-w-6xl px-5 md:px-8">
							<section
								aria-label={t("booking.events")}
								className="flex flex-col gap-3 pt-3 max-md:gap-0 max-md:pb-24"
							>
								<PageHeader className="max-md:flex-nowrap">
									<PageHeaderText>
										<PageTitle>{t("booking.title")}</PageTitle>
										<PageDescription>
											{t("booking.description")}
										</PageDescription>
									</PageHeaderText>
									<PageHeaderActions className="flex-nowrap">
										<Button
											asChild
											variant="ghost"
											size="icon"
											className="max-md:-mr-2"
										>
											<Link
												href={`/c/${username}`}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={t("booking.openPage", { name: username })}
												className="text-signal"
											>
												<ExternalLink size={18} aria-hidden="true" />
											</Link>
										</Button>

										<Button
											type="button"
											onClick={startCreate}
											disabled={!currentUserId}
											float="mobile"
										>
											<Plus data-icon="inline-start" />
											{t("booking.newEvent")}
										</Button>
									</PageHeaderActions>
								</PageHeader>

								{(() => {
									if (loading) {
										return <BookingListSkeleton />;
									}
									if (listEvents.length === 0) {
										return (
											<Empty>
												<EmptyHeader>
													<EmptyMedia variant="icon">
														<CalendarDays />
													</EmptyMedia>
													<EmptyTitle>{t("booking.none")}</EmptyTitle>
													<EmptyDescription>
														{t("booking.noneHint")}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										);
									}
									return listEvents.map((event) => (
										<article
											key={event.id}
											className={clsx(
												!event.enabled && "opacity-65",
												"relative flex flex-wrap items-center gap-4 rounded-lg border bg-card px-5 py-5 max-md:gap-3 max-md:rounded-none max-md:border-0 max-md:border-b max-md:px-0 max-md:py-4 max-md:last:border-b-0"
											)}
										>
											<div className="flex min-w-0 flex-1 items-start gap-4">
												<span
													className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-md border ${event.enabled ? "border-ring bg-primary text-primary-foreground" : "border-border"}`}
												>
													{event.enabled && <Check className="size-3.5" />}
												</span>
												<div className="min-w-0">
													<Button
														variant="ghost"
														type="button"
														onClick={() => startEdit(event)}
														className="-mx-2 text-left whitespace-normal"
													>
														<span className="text-lg font-semibold max-md:text-base">
															{event.name}
														</span>
													</Button>
													{event.description && (
														<p className="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
															{event.description}
														</p>
													)}
													<p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
														<span className="inline-flex items-center gap-1">
															<Clock3 className="size-3.5" />
															{durationLabel(event.durationMinutes, t)}
														</span>
														<span>·</span>
														<span className="inline-flex items-center gap-1">
															<MapPin className="size-3.5" />
															{event.location || t("booking.noLocation")}
														</span>
													</p>
													<p className="mt-2 text-sm text-muted-foreground">
														{availabilityLabel(event, t)}
													</p>
												</div>
											</div>
											<div className="ml-auto flex items-center gap-2 max-md:ml-9 max-md:w-full">
												{event.enabled ? (
													<>
														<Button
															type="button"
															variant="outline"
															onClick={() => copyLink(event)}
														>
															<Copy data-icon="inline-start" />
															{t("booking.copyLink")}
														</Button>
														{username && (
															<Button
																asChild
																variant="ghost"
																size="icon"
																className="text-muted-foreground"
															>
																<Link
																	href={`/c/${username}/${event.slug}`}
																	target="_blank"
																	aria-label={t("booking.openPage", {
																		name: event.name,
																	})}
																>
																	<ExternalLink />
																</Link>
															</Button>
														)}
													</>
												) : (
													<Button
														type="button"
														variant="outline"
														disabled={
															event.isTemplate && savingTemplateId !== null
														}
														onClick={() => setEnabled(event, true)}
													>
														{savingTemplateId === event.id
															? t("booking.turningOn")
															: t("booking.turnOn")}
													</Button>
												)}
												{!event.isTemplate && (
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																aria-label={t("booking.moreOptions", {
																	name: event.name,
																})}
															>
																<MoreHorizontal />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuGroup>
																<DropdownMenuItem
																	onSelect={() => startEdit(event)}
																>
																	{t("booking.edit")}
																</DropdownMenuItem>
																<DropdownMenuItem
																	onSelect={() =>
																		setEnabled(event, !event.enabled)
																	}
																>
																	{event.enabled
																		? t("booking.turnOff")
																		: t("booking.turnOn")}
																</DropdownMenuItem>
																<DropdownMenuItem
																	variant="destructive"
																	onSelect={() => remove(event)}
																>
																	{t("common.delete")}
																</DropdownMenuItem>
															</DropdownMenuGroup>
														</DropdownMenuContent>
													</DropdownMenu>
												)}
											</div>
										</article>
									));
								})()}
							</section>
						</div>
					</div>
					{form && (
						<BookingEditor
							form={form}
							open={panelOpen}
							editingId={editingId}
							username={username}
							hosts={hosts}
							canManageHosts={canManageHosts}
							currentUserId={currentUserId}
							saving={saving}
							onChange={setForm}
							onClose={closeEditor}
							onSave={() => save()}
							onDelete={() => {
								const event = events.find((item) => item.id === editingId);
								if (event) {
									void remove(event);
								}
							}}
							onToggleEnabled={() => {
								const event = events.find((item) => item.id === editingId);
								if (event) {
									void setEnabled(event, !event.enabled);
								}
							}}
							onClosed={() => {
								if (!panelOpen) {
									setForm(null);
									setEditingId(null);
								}
							}}
						/>
					)}
				</div>
			</section>
		</div>
	);
}
