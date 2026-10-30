"use client";
import {
	CalendarDays,
	ChevronDown,
	Clock3,
	MapPin,
	MoreHorizontal,
	Plus,
	Trash2,
	UserRound,
} from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
	Field,
	FieldError,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { slugifyBookingName } from "@/lib/booking/utils";
import { folderColorKeys } from "@/lib/folders/color-keys";
import { FOLDER_COLOR_OPTIONS } from "@/lib/folders/colors";
import type { TranslationKey } from "@/lib/i18n/types";
import { cn as clsx } from "@/lib/utils";

import { BookingHostAvatar } from "./booking-host-avatar";
import type { BookingEditorProps } from "./editor-types";
import type { BookingEditorSection } from "./types";
import {
	bookingFormWithName,
	durationLabel,
	formAvailabilityLabel,
	matchBookingHost,
	nextBookingTimeRange,
	WEEKDAYS,
} from "./utils";

function BookingEditorSession({
	form,
	open,
	editingId,
	username,
	hosts,
	canManageHosts,
	currentUserId,
	saving,
	onChange,
	onClose,
	onSave,
	onDelete,
	onToggleEnabled,
	onClosed: _onClosed,
}: BookingEditorProps) {
	const { t } = useLanguage();
	const mobile = useIsMobile();
	const Panel = mobile ? Drawer : Sheet;
	const PanelContent = mobile ? DrawerContent : SheetContent;
	const PanelTitle = mobile ? DrawerTitle : SheetTitle;
	const [activeSection, setActiveSection] =
		useState<BookingEditorSection>(null);
	const [nameEditing, setNameEditing] = useState(false);

	const [hostQuery, setHostQuery] = useState("");
	const [hostError, setHostError] = useState("");

	const sectionClass = "border-b border-border px-5 py-5";
	const headingClass = "w-full justify-between text-left";
	const summaryClass = "mt-2 w-full justify-start text-left";
	const toggle = (section: BookingEditorSection) =>
		setActiveSection((current) => (current === section ? null : section));

	function renderHostSection() {
		return (
			<section className={sectionClass}>
				<Button
					variant="ghost"
					type="button"
					onClick={() => toggle("host")}
					aria-expanded={activeSection === "host"}
					className={headingClass}
				>
					<span className="text-base font-semibold">
						{t("booking.editor.host")}
					</span>
					<ChevronDown
						data-icon="inline-start"
						className={clsx(
							"size-5 text-muted-foreground transition-transform",
							activeSection === "host" && "rotate-180"
						)}
					/>
				</Button>
				{activeSection === "host" ? (
					<div className="mt-4 flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							{form.hostIds.map((id) => {
								const host = hosts.find((item) => item.id === id);
								const isCurrentUser = id === currentUserId;
								return (
									<div
										key={id}
										className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2"
									>
										{host ? (
											<BookingHostAvatar
												host={host}
												currentUserId={currentUserId}
											/>
										) : (
											<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground">
												<UserRound className="size-4" />
											</span>
										)}
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium text-foreground">
												{host?.name || t("booking.editor.unavailableUser")}
												{isCurrentUser ? t("booking.editor.you") : ""}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{host?.email}
											</span>
										</span>
										{!isCurrentUser && (
											<Button
												variant="ghost"
												type="button"
												onClick={() =>
													onChange({
														...form,
														hostIds: form.hostIds.filter(
															(hostId) => hostId !== id
														),
													})
												}
												size="sm"
											>
												{t("resend.remove")}
											</Button>
										)}
									</div>
								);
							})}
						</div>
						{canManageHosts && (
							<form
								onSubmit={(event) => {
									event.preventDefault();
									const match = matchBookingHost(hosts, hostQuery, t);
									if (!match.host) {
										setHostError(match.error);
										return;
									}
									if (form.hostIds.includes(match.host.id)) {
										setHostError(t("booking.editor.alreadyHost"));
										return;
									}
									if (form.hostIds.length >= 20) {
										setHostError(t("booking.editor.maxHosts"));
										return;
									}
									onChange({
										...form,
										hostIds: [...form.hostIds, match.host.id],
									});
									setHostQuery("");
									setHostError("");
								}}
							>
								<Field>
									<FieldLabel htmlFor="booking-host-input">
										{t("booking.editor.addHost")}
									</FieldLabel>
									<div className="flex gap-2">
										<Input
											id="booking-host-input"
											value={hostQuery}
											onChange={(event) => {
												setHostQuery(event.target.value);
												setHostError("");
											}}
											placeholder={t("booking.editor.nameOrEmail")}
											autoComplete="off"
											aria-invalid={!!hostError}
											aria-describedby={
												hostError ? "booking-host-error" : undefined
											}
											className="min-w-0 flex-1"
										/>
										<Button
											type="submit"
											variant="outline"
											className="shrink-0"
										>
											{t("booking.editor.add")}
										</Button>
									</div>
									{hostError && (
										<FieldError id="booking-host-error" role="alert">
											{hostError}
										</FieldError>
									)}
								</Field>
							</form>
						)}
					</div>
				) : (
					<Button
						variant="ghost"
						type="button"
						onClick={() => toggle("host")}
						className={summaryClass}
					>
						<span className="flex shrink-0 gap-1">
							{form.hostIds.slice(0, 3).map((id) => {
								const host = hosts.find((item) => item.id === id);
								return host ? (
									<BookingHostAvatar
										key={id}
										host={host}
										currentUserId={currentUserId}
										size="small"
									/>
								) : (
									<span
										key={id}
										className="flex size-5 items-center justify-center rounded-full bg-accent"
									>
										<UserRound className="size-3" />
									</span>
								);
							})}
						</span>
						<span className="truncate">
							{form.hostIds
								.map(
									(id) =>
										hosts.find((host) => host.id === id)?.name ??
										t("booking.editor.userFallback")
								)
								.join(", ")}
						</span>
					</Button>
				)}
			</section>
		);
	}

	function renderDurationSection() {
		return (
			<section className={sectionClass}>
				<Button
					variant="ghost"
					type="button"
					onClick={() => toggle("duration")}
					aria-expanded={activeSection === "duration"}
					className={headingClass}
				>
					<span className="text-base font-semibold">
						{t("booking.editor.duration")}
					</span>
					<ChevronDown
						data-icon="inline-start"
						className={clsx(
							"size-5 text-muted-foreground transition-transform",
							activeSection === "duration" && "rotate-180"
						)}
					/>
				</Button>
				{activeSection === "duration" ? (
					<div className="mt-4">
						<NativeSelect
							containerClassName="min-w-0 w-full"
							aria-label={t("booking.editor.meetingLength")}
							value={
								[15, 30, 45, 60].includes(form.durationMinutes)
									? form.durationMinutes
									: "custom"
							}
							onChange={(event) =>
								onChange({
									...form,
									durationMinutes:
										event.target.value === "custom"
											? 90
											: Number(event.target.value),
								})
							}
						>
							<option value={15}>{t("booking.editor.minutes15")}</option>
							<option value={30}>{t("booking.editor.minutes30")}</option>
							<option value={45}>{t("booking.editor.minutes45")}</option>
							<option value={60}>{t("booking.editor.hour1")}</option>
							<option value="custom">{t("booking.editor.custom")}</option>
						</NativeSelect>
						{![15, 30, 45, 60].includes(form.durationMinutes) && (
							<Input
								aria-label={t("booking.editor.customMinutes")}
								type="number"
								min={5}
								max={480}
								step={5}
								value={form.durationMinutes}
								onChange={(event) =>
									onChange({
										...form,
										durationMinutes: Number(event.target.value),
									})
								}
								className="mt-3"
							/>
						)}
					</div>
				) : (
					<Button
						variant="ghost"
						type="button"
						onClick={() => toggle("duration")}
						className={summaryClass}
					>
						<Clock3 data-icon="inline-start" />
						{durationLabel(form.durationMinutes, t)}
					</Button>
				)}
			</section>
		);
	}

	function renderBookingPanel() {
		return (
			<Panel
				open={open}
				onOpenChange={(value) => {
					if (!value && !saving) {
						onClose();
					}
				}}
			>
				<PanelContent
					aria-describedby={undefined}
					className="flex max-h-[95dvh] flex-col gap-0 overflow-hidden p-0 pb-safe sm:h-dvh sm:max-h-dvh sm:w-105"
				>
					<PanelTitle className="sr-only">
						{t("booking.editor.details")}
					</PanelTitle>
					<div className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain">
						<section className={sectionClass}>
							<div className="flex items-center gap-3">
								<Button
									variant="ghost"
									type="button"
									onClick={() => setActiveSection("event")}
									aria-label={t("booking.editor.editColor")}
									size="icon"
									className="shrink-0"
								>
									<span
										className={clsx(
											"size-6 rounded-full",
											"bg-(--layout-color)"
										)}
										style={
											{ "--layout-color": form.color } as React.CSSProperties
										}
									/>
								</Button>
								{nameEditing ? (
									<Input
										autoFocus
										aria-label={t("booking.editor.meetingName")}
										value={form.name}
										onChange={(event) =>
											onChange(bookingFormWithName(form, event.target.value))
										}
										onBlur={() => setNameEditing(false)}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === "Escape") {
												setNameEditing(false);
											}
										}}
										placeholder={t("booking.editor.newMeeting")}
										maxLength={120}
										variant="title"
										className="min-w-0 flex-1 cursor-text"
									/>
								) : (
									<Button
										variant="ghost"
										type="button"
										onClick={() => {
											setActiveSection("event");
											setNameEditing(true);
										}}
										className={clsx(
											"min-w-0 flex-1 justify-start text-left break-words whitespace-normal",
											activeSection === "event" ? "cursor-text" : ""
										)}
									>
										<span className="text-xl font-semibold">
											{form.name || t("booking.editor.newMeeting")}
										</span>
									</Button>
								)}
								<Button
									variant="ghost"
									type="button"
									onClick={() => toggle("event")}
									aria-label={t("booking.editor.toggleDetails")}
									aria-expanded={activeSection === "event"}
									size="icon"
								>
									<ChevronDown
										data-icon="inline-start"
										className={clsx(
											"size-5 transition-transform",
											activeSection === "event" && "rotate-180"
										)}
									/>
								</Button>
							</div>
							{activeSection === "event" && (
								<div className="mt-5 flex flex-col gap-4">
									<Field>
										<FieldLabel htmlFor="apps-field-srcappcalendarbookingbookingeditortsx-0">
											{t("booking.editor.slug")}
										</FieldLabel>
										<Input
											id="apps-field-srcappcalendarbookingbookingeditortsx-0"
											value={form.slug}
											onChange={(event) =>
												onChange({
													...form,
													slug: slugifyBookingName(event.target.value),
												})
											}
											placeholder={t("booking.editor.slugPlaceholder")}
											maxLength={80}
										/>
										<span className="text-xs break-all text-muted-foreground">
											/c/{username || t("booking.editor.yourName")}/
											{form.slug || t("booking.editor.eventSlug")}
										</span>
									</Field>
									<Field>
										<FieldLabel htmlFor="apps-field-srcappcalendarbookingbookingeditortsx-1">
											{t("calendar.description")}
										</FieldLabel>
										<Textarea
											id="apps-field-srcappcalendarbookingbookingeditortsx-1"
											value={form.description}
											onChange={(event) =>
												onChange({ ...form, description: event.target.value })
											}
											placeholder={t("booking.editor.descriptionPlaceholder")}
											maxLength={2000}
											rows={4}
											className="resize-y"
										/>
									</Field>
									<FieldSet className="">
										<FieldLegend variant="label">
											{t("booking.editor.color")}
										</FieldLegend>
										<fieldset
											className="flex flex-wrap gap-2"

											aria-label={t("calendar.eventColor")}
										>
											{FOLDER_COLOR_OPTIONS.map((option) => (
												<Button
													variant="ghost"
													key={option.value}
													type="button"

													aria-label={t(folderColorKeys[option.value])}
													aria-pressed={form.color === option.value}
													onClick={() =>
														onChange({ ...form, color: option.value })
													}
													size="icon-sm"
												>
													<span
														className={clsx(
															clsx(
																"flex size-8 items-center justify-center rounded-full border-2 border-background ring-2",
																form.color === option.value
																	? "ring-border"
																	: "ring-transparent hover:ring-border"
															),
															"bg-(--layout-color)"
														)}
														style={
															{
																"--layout-color": option.value,
															} as React.CSSProperties
														}
													>
														{form.color === option.value && (
															<span className="size-2 rounded-full bg-card" />
														)}
													</span>
												</Button>
											))}
										</fieldset>
									</FieldSet>
								</div>
							)}
						</section>
						{renderDurationSection()}
						<section className={sectionClass}>
							<Button
								variant="ghost"
								type="button"
								onClick={() => toggle("location")}
								aria-expanded={activeSection === "location"}
								className={headingClass}
							>
								<span className="text-base font-semibold">
									{t("booking.editor.location")}
								</span>
								<ChevronDown
									data-icon="inline-start"
									className={clsx(
										"size-5 text-muted-foreground transition-transform",
										activeSection === "location" && "rotate-180"
									)}
								/>
							</Button>
							{activeSection === "location" ? (
								<Input
									aria-label={t("booking.editor.location")}
									value={form.location}
									onChange={(event) =>
										onChange({ ...form, location: event.target.value })
									}
									placeholder={t("booking.editor.locationPlaceholder")}
									maxLength={240}
									className="mt-4"
								/>
							) : (
								<Button
									variant="ghost"
									type="button"
									onClick={() => toggle("location")}
									className={summaryClass}
								>
									<MapPin data-icon="inline-start" />
									{form.location || t("booking.noLocation")}
								</Button>
							)}
						</section>
						<section className={sectionClass}>
							<Button
								variant="ghost"
								type="button"
								onClick={() => toggle("availability")}
								aria-expanded={activeSection === "availability"}
								className={headingClass}
							>
								<span className="text-base font-semibold">
									{t("booking.editor.availability")}
								</span>
								<ChevronDown
									data-icon="inline-start"
									className={clsx(
										"size-5 text-muted-foreground transition-transform",
										activeSection === "availability" && "rotate-180"
									)}
								/>
							</Button>
							{activeSection === "availability" ? (
								<div className="mt-4 flex flex-col gap-4">
									<fieldset aria-label={t("booking.editor.availableDays")}>
										<ToggleGroup
											multiple
											variant="outline"
											value={form.weekdays.map(String)}
											onValueChange={(values) =>
												onChange({
													...form,
													weekdays: values.map(Number).toSorted(),
												})
											}
											className="flex flex-wrap justify-start"
										>
											{WEEKDAYS.map((day) => (
												<ToggleGroupItem
													key={day}
													value={String(day)}
													aria-label={t(`weekday.${day}` as TranslationKey)}
												>
													{t(`calendar.weekdayShort.${day}` as TranslationKey)}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</fieldset>
									<div className="mt-2 flex flex-row gap-8">
										<p className="mt-3 text-sm font-medium text-foreground/80">
											{t("booking.editor.times")}
										</p>

										<div className="flex w-full min-w-0 flex-1 flex-col items-start gap-2">
											{form.timeRanges.map((range, index) => (
												<div
													key={index}
													className="flex w-full items-end gap-2"
												>
													<Field className="min-w-0 flex-1 gap-1">
														<FieldLabel
															className=""
															htmlFor={`booking-time-2-${index}`}
														>
															{t("calendar.from")}
														</FieldLabel>
														<Input
															id={`booking-time-2-${index}`}
															type="time"
															step={900}
															value={range.startTime}
															onChange={(event) =>
																onChange({
																	...form,
																	timeRanges: form.timeRanges.map(
																		(item, itemIndex) =>
																			itemIndex === index
																				? {
																						...item,
																						startTime: event.target.value,
																					}
																				: item
																	),
																})
															}
															className="min-w-0"
														/>
													</Field>
													<Field className="min-w-0 flex-1 gap-1">
														<FieldLabel
															className=""
															htmlFor={`booking-time-3-${index}`}
														>
															{t("calendar.to")}
														</FieldLabel>
														<Input
															id={`booking-time-3-${index}`}
															type="time"
															step={900}
															value={range.endTime}
															onChange={(event) =>
																onChange({
																	...form,
																	timeRanges: form.timeRanges.map(
																		(item, itemIndex) =>
																			itemIndex === index
																				? {
																						...item,
																						endTime: event.target.value,
																					}
																				: item
																	),
																})
															}
															className="min-w-0"
														/>
													</Field>
													<Button
														variant="ghost"
														type="button"
														aria-label={t("booking.editor.removeTime", {
															n: index + 1,
														})}
														disabled={form.timeRanges.length === 1}
														onClick={() =>
															onChange({
																...form,
																timeRanges: form.timeRanges.filter(
																	(_, itemIndex) => itemIndex !== index
																),
															})
														}
														size="icon"
														className=""
													>
														<Trash2 data-icon="inline-start" />
													</Button>
												</div>
											))}

											<Button
												variant="ghost"
												type="button"
												disabled={form.timeRanges.length >= 12}
												onClick={() =>
													onChange({
														...form,
														timeRanges: [
															...form.timeRanges,
															nextBookingTimeRange(
																form.timeRanges,
																form.durationMinutes
															),
														],
													})
												}
												size="sm"
												className="mt-3"
											>
												<Plus data-icon="inline-start" />
												{t("booking.editor.addTime")}
											</Button>
										</div>
									</div>
									<p className="text-xs text-muted-foreground">
										{t("booking.editor.timesUse", { zone: form.timeZone })}
									</p>
								</div>
							) : (
								<Button
									variant="ghost"
									type="button"
									onClick={() => toggle("availability")}
									className={summaryClass}
								>
									<CalendarDays data-icon="inline-start" className="shrink-0" />
									{formAvailabilityLabel(form, t)}
								</Button>
							)}
						</section>
						{renderHostSection()}
					</div>
					<div className="relative flex shrink-0 items-center justify-end gap-2 bg-card px-4 py-3">
						{editingId && (
							<DropdownMenu>
								<DropdownMenuTrigger render={<Button variant="outline" />}>
									<MoreHorizontal data-icon="inline-start" />
									{t("booking.editor.more")}
								</DropdownMenuTrigger>
								<DropdownMenuContent side="top" align="end">
									<DropdownMenuGroup>
										<DropdownMenuItem onClick={onToggleEnabled}>
											{form.enabled
												? t("booking.turnOff")
												: t("booking.turnOn")}
										</DropdownMenuItem>
										<DropdownMenuItem variant="destructive" onClick={onDelete}>
											{t("common.delete")}
										</DropdownMenuItem>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						<Button
							type="button"
							variant="ghost"
							disabled={saving}
							onClick={onClose}
						>
							{t("common.cancel")}
						</Button>
						<Button type="button" disabled={saving} onClick={onSave}>
							{(() => {
								if (saving) {
									return t("common.saving");
								}
								if (editingId) {
									return t("settings.mailbox.saveChanges");
								}
								return t("booking.editor.create");
							})()}
						</Button>
					</div>
				</PanelContent>
			</Panel>
		);
	}
	return renderBookingPanel();
}

export function BookingEditor(props: BookingEditorProps) {
	return (
		<BookingEditorSession
			key={`${props.editingId ?? "new"}:${props.open}`}
			{...props}
		/>
	);
}
