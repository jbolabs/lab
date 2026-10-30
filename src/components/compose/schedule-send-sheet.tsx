"use client";

import {
	CalendarClock,
	ChevronLeft,
	ChevronRight,
	FileText,
	Plus,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerTitle,
	DrawerClose,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/auth/client";
import { getUserTimeZone } from "@/lib/time/utils";
import { cn } from "@/lib/utils";

import { textToHtml } from "./rich-text-utils";
import type { ScheduleSendSheetProps } from "./schedule-send-types";
import {
	formatDateTimeLocal,
	formatScheduledSend,
	getScheduleSendOptions,
	isPastSchedule,
	parseDateTimeLocal,
} from "./schedule-send-utils";
import type { ComposeTemplate } from "./template-types";

type Page = "root" | "date" | "templates";
const PAGES: Page[] = ["root", "date", "templates"];

const pageClass =
	"flex max-h-[calc(85dvh-3.5rem)] w-full shrink-0 flex-col px-2 pb-3";

// Rows of the phone sheet: full-width ghost Buttons (size="lg") laid out as list items.
const rowClass = "w-full justify-start   text-left  ";

/** Phone version of the Send options menu: a bottom sheet whose pages slide in (root → date, templates). */
export function ScheduleSendSheet({
	open,
	onOpenChange,
	value,
	onChange,
	onApplyTemplate,
	onNewTemplate,
}: ScheduleSendSheetProps) {
	const { t } = useLanguage();
	const [page, setPage] = useState<Page>("root");
	const [templates, setTemplates] = useState<ComposeTemplate[]>([]);
	const [draftDate, setDraftDate] = useState(() =>
		value ? formatDateTimeLocal(value) : ""
	);
	const pageRefs = useRef<Record<Page, HTMLDivElement | null>>({
		date: null,
		root: null,
		templates: null,
	});
	const [height, setHeight] = useState<number | undefined>(undefined);

	// The sheet is as tall as the page showing, and eases between heights as pages slide.
	useEffect(() => {
		const element = pageRefs.current[page];
		if (!open || !element) {
			return;
		}
		const measure = () => setHeight(element.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [open, page]);

	const [wasOpen, setWasOpen] = useState(open);
	if (wasOpen !== open) {
		setWasOpen(open);
		if (open) {
			setPage("root");
			setDraftDate(value ? formatDateTimeLocal(value) : "");
		}
	}
	useEffect(() => {
		if (!open) {
			return;
		}
		void authFetch("/api/templates", { cache: "no-store" })
			.then(async (response) => {
				if (response.ok) {
					setTemplates(
						((await response.json()) as { templates: ComposeTemplate[] })
							.templates
					);
				}

				return null;
			})
			.catch(() => {
				// Keep the current UI state when this optional background request fails.
			});
	}, [open]);

	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		if (!open) {
			return;
		}
		const timer = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(timer);
	}, [open]);
	const options = getScheduleSendOptions(now);
	const minimum = formatDateTimeLocal(now);
	const parsedDate = parseDateTimeLocal(draftDate);
	const pastDate = parsedDate !== null && isPastSchedule(parsedDate, now);
	const getPageTitle = () => {
		if (page === "date") {
			return t("schedule.pick", { timeZone: getUserTimeZone() });
		}
		return page === "templates" ? t("template.menu") : t("schedule.heading");
	};
	const title = getPageTitle();

	function choose(date: Date | null) {
		onChange(date);
		onOpenChange(false);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent
				aria-label={t("schedule.optionsLabel")}
				aria-describedby={undefined}
				className="overflow-hidden"
			>
				<div className="pb-safe">
					<div className="flex h-14 items-center gap-1 px-2">
						{page === "root" ? (
							<span className="w-10" />
						) : (
							<Button
								variant="ghost"
								size="icon-lg"
								type="button"
								onClick={() => setPage("root")}
							>
								<ChevronLeft data-icon="inline-start" />
								<span className="sr-only">{t("schedule.heading")}</span>
							</Button>
						)}
						<DrawerTitle className="flex-1 text-center">{title}</DrawerTitle>
						<DrawerClose
							render={<Button variant="ghost" size="icon-lg" type="button" />}
						>
							<X />
							<span className="sr-only">{t("navigation.close")}</span>
						</DrawerClose>
					</div>
					<div
						className="h-(--panel-height) overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none"
						style={{ "--panel-height": `${height}px` } as CSSProperties}
					>
						<div
							className="flex [transform:var(--mf-transform)] items-start transition-transform duration-300 ease-out motion-reduce:transition-none"
							style={
								{
									"--mf-transform": `translateX(-${PAGES.indexOf(page) * 100}%)`,
								} as CSSProperties
							}
						>
							<div
								ref={(node) => {
									pageRefs.current.root = node;
								}}
								className={pageClass}
								inert={page !== "root"}
							>
								<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
									{value && (
										<Button
											size="lg"
											variant="ghost"
											type="button"
											onClick={() => choose(null)}
											className={rowClass}
										>
											<X
												data-icon="inline-start"
												className="text-muted-foreground"
											/>
											{t("schedule.clear")}
										</Button>
									)}
									{options.map((option) => (
										<Button
											size="lg"
											variant="ghost"
											key={option.labelKey}
											type="button"
											onClick={() => choose(option.value)}
											className={cn(rowClass, "justify-between")}
										>
											<span>{t(option.labelKey)}</span>
											<span className="text-sm text-muted-foreground">
												{option.value && formatScheduledSend(option.value)}
											</span>
										</Button>
									))}
								</div>
								<div className="shrink-0 pt-2">
									<Button
										size="lg"
										variant="ghost"
										type="button"
										onClick={() => setPage("date")}
										className={cn(rowClass, "justify-between")}
									>
										<span className="flex items-center">
											<CalendarClock className="text-muted-foreground" />
											{t("schedule.pick", { timeZone: getUserTimeZone() })}
										</span>
										<ChevronRight
											data-icon="inline-start"
											className="text-muted-foreground/70"
										/>
									</Button>
									<Button
										size="lg"
										variant="ghost"
										type="button"
										onClick={() => setPage("templates")}
										className={cn(rowClass, "justify-between")}
									>
										<span className="flex items-center">
											<FileText className="text-muted-foreground" />
											{t("template.menu")}
										</span>
										<ChevronRight
											data-icon="inline-start"
											className="text-muted-foreground/70"
										/>
									</Button>
								</div>
							</div>
							<div
								ref={(node) => {
									pageRefs.current.date = node;
								}}
								className={pageClass}
								inert={page !== "date"}
							>
								<div className="min-h-0 flex-1 overflow-y-auto px-2">
									<Input
										type="datetime-local"
										min={minimum}
										value={draftDate}
										onChange={(event) => setDraftDate(event.target.value)}
										aria-label={t("schedule.pick", {
											timeZone: getUserTimeZone(),
										})}
										aria-invalid={pastDate}
										aria-describedby={
											pastDate ? "schedule-past-time" : undefined
										}
										className="w-full"
									/>
									{pastDate && (
										<p
											id="schedule-past-time"
											role="alert"
											className="mt-2 text-sm text-destructive"
										>
											{t("schedule.pastTime")}
										</p>
									)}
								</div>
								<div className="shrink-0 px-2 pt-4">
									<Button
										type="button"
										size="lg"
										className="w-full"
										disabled={!parsedDate || pastDate}
										onClick={() => choose(parsedDate)}
									>
										{t("schedule.heading")}
									</Button>
								</div>
							</div>
							<div
								ref={(node) => {
									pageRefs.current.templates = node;
								}}
								className={pageClass}
								inert={page !== "templates"}
							>
								<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
									{templates.length === 0 && (
										<p className="py-3 text-sm text-muted-foreground">
											{t("template.none")}
										</p>
									)}
									{templates.map((template) => (
										<Button
											size="lg"
											variant="ghost"
											key={template.id}
											type="button"
											onClick={() => {
												onApplyTemplate({
													html:
														template.htmlBody ??
														textToHtml(template.textBody ?? ""),
													title: template.subject ?? "",
												});
												onOpenChange(false);
											}}
											className={rowClass}
										>
											<span className="break-words">
												{template.subject || t("template.untitled")}
											</span>
										</Button>
									))}
								</div>
								<div className="shrink-0 pt-2">
									<Button
										size="lg"
										variant="ghost"
										type="button"
										onClick={() => {
											onOpenChange(false);
											onNewTemplate();
										}}
										className={cn(rowClass, "")}
									>
										<Plus data-icon="inline-start" />
										{t("template.new")}
									</Button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
