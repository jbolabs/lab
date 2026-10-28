"use client";

import {
	Drawer,
	DrawerContent,
	DrawerTitle,
	DrawerClose,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import {
	CalendarClock,
	ChevronLeft,
	ChevronRight,
	FileText,
	Plus,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { authFetch } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { getUserTimeZone } from "@/lib/time/utils";
import { textToHtml } from "./rich-text-utils";
import {
	formatDateTimeLocal,
	formatScheduledSend,
	getScheduleSendOptions,
	isPastSchedule,
	parseDateTimeLocal,
} from "./schedule-send-utils";
import type { ScheduleSendSheetProps } from "./schedule-send-types";
import type { ComposeTemplate } from "./template-types";

type Page = "root" | "date" | "templates";
const PAGES: Page[] = ["root", "date", "templates"];

const pageClass =
	"flex max-h-[calc(85dvh-3.5rem)] w-full shrink-0 flex-col px-2 pb-3";

const rowClass =
	"flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base text-foreground active:bg-accent";

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
	const [draftDate, setDraftDate] = useState("");
	const pageRefs = useRef<Record<Page, HTMLDivElement | null>>({
		root: null,
		date: null,
		templates: null,
	});
	const [height, setHeight] = useState<number | undefined>(undefined);

	// The sheet is as tall as the page showing, and eases between heights as pages slide.
	useEffect(() => {
		const element = pageRefs.current[page];
		if (!open || !element) return;
		const measure = () => setHeight(element.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [open, page, templates.length, value]);

	useEffect(() => {
		if (!open) return;
		setPage("root");
		setDraftDate(value ? formatDateTimeLocal(value) : "");
		void authFetch("/api/templates", { cache: "no-store" })
			.then(async (response) => {
				if (response.ok)
					setTemplates(
						((await response.json()) as { templates: ComposeTemplate[] })
							.templates,
					);
			})
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const options = getScheduleSendOptions();
	const minimum = formatDateTimeLocal(new Date());
	const parsedDate = parseDateTimeLocal(draftDate);
	const pastDate = parsedDate !== null && isPastSchedule(parsedDate);
	const title =
		page === "date"
			? t("schedule.pick", { timeZone: getUserTimeZone() })
			: page === "templates"
				? t("template.menu")
				: t("schedule.heading");

	function choose(date: Date | null) {
		onChange(date);
		onOpenChange(false);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent
				aria-label={t("schedule.optionsLabel")}
				aria-describedby={undefined}
				className="overflow-hidden pb-[env(safe-area-inset-bottom)]"
			>
				<div className="flex h-14 items-center gap-1 px-2">
					{page === "root" ? (
						<span className="w-10" />
					) : (
						<Button
							variant="ghost"
							type="button"
							onClick={() => setPage("root")}
							className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 active:bg-accent"
						>
							<ChevronLeft data-icon="inline-start" />
							<span className="sr-only">{t("schedule.heading")}</span>
						</Button>
					)}
					<DrawerTitle className="flex-1 truncate text-center text-base font-semibold text-foreground">
						{title}
					</DrawerTitle>
					<DrawerClose className="flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 active:bg-accent">
						<X className="h-5 w-5" />
						<span className="sr-only">{t("navigation.close")}</span>
					</DrawerClose>
				</div>
				<div
					className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
					style={{ height }}
				>
					<div
						className="flex items-start transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
						style={{ transform: `translateX(-${PAGES.indexOf(page) * 100}%)` }}
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
										variant="ghost"
										type="button"
										onClick={() => choose(null)}
										className={rowClass}
									>
										<X
											data-icon="inline-start" className="text-muted-foreground"
										/>
										{t("schedule.clear")}
									</Button>
								)}
								{options.map((option) => (
									<Button
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
									variant="ghost"
									type="button"
									onClick={() => setPage("date")}
									className={cn(rowClass, "justify-between")}
								>
									<span className="flex items-center gap-3">
										<CalendarClock className="h-5 w-5 text-muted-foreground" />
										{t("schedule.pick", { timeZone: getUserTimeZone() })}
									</span>
									<ChevronRight
										data-icon="inline-start" className="text-muted-foreground/70"
									/>
								</Button>
								<Button
									variant="ghost"
									type="button"
									onClick={() => setPage("templates")}
									className={cn(rowClass, "justify-between")}
								>
									<span className="flex items-center gap-3">
										<FileText className="h-5 w-5 text-muted-foreground" />
										{t("template.menu")}
									</span>
									<ChevronRight
										data-icon="inline-start" className="text-muted-foreground/70"
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
									aria-describedby={pastDate ? "schedule-past-time" : undefined}
									className="h-12 w-full rounded-lg border border-border px-3 text-base outline-none focus:border-ring"
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
									className="h-12 w-full rounded-lg text-base"
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
									<p className="px-3 py-3 text-sm text-muted-foreground">
										{t("template.none")}
									</p>
								)}
								{templates.map((template) => (
									<Button
										variant="ghost"
										key={template.id}
										type="button"
										onClick={() => {
											onApplyTemplate({
												title: template.subject ?? "",
												html:
													template.htmlBody ??
													textToHtml(template.textBody ?? ""),
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
									variant="ghost"
									type="button"
									onClick={() => {
										onOpenChange(false);
										onNewTemplate();
									}}
									className={cn(rowClass, "text-signal")}
								>
									<Plus data-icon="inline-start" />
									{t("template.new")}
								</Button>
							</div>
						</div>
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
