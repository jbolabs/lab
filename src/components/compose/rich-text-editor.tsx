"use client";

import {
	Bold,
	Italic,
	Link2,
	List,
	ListOrdered,
	MoreHorizontal,
	Quote,
	RemoveFormatting,
	Strikethrough,
	Underline,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";

import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { EmailHtmlRenderer } from "@/components/messages/email-html-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { sanitizeEmailHtml, sanitizeEditorHtml } from "@/lib/email/html";
import { cn } from "@/lib/utils";

import type {
	RichTextEditorProps,
	ToolbarCommand,
} from "./rich-text-editor-types";

const COMMANDS: ToolbarCommand[] = [
	{ command: "bold", icon: Bold, labelKey: "editor.bold" },
	{ command: "italic", icon: Italic, labelKey: "editor.italic" },
	{ command: "underline", icon: Underline, labelKey: "editor.underline" },
	{
		command: "strikeThrough",
		icon: Strikethrough,
		labelKey: "editor.strikethrough",
	},
	{
		command: "insertUnorderedList",
		icon: List,
		labelKey: "editor.bulletedList",
	},
	{
		command: "insertOrderedList",
		icon: ListOrdered,
		labelKey: "editor.numberedList",
	},
	{
		command: "formatBlock",
		icon: Quote,
		labelKey: "editor.quote",
		value: "blockquote",
	},
];

function onPaste(event: ClipboardEvent<HTMLDivElement>) {
	event.preventDefault();
	const text = event.clipboardData.getData("text/plain");
	document.execCommand("insertText", false, text);
}

/**
 * A small HTML editor built on contentEditable. It stays deliberately light:
 * inline styles, lists, quotes and links, with pasted content flattened to
 * text so a message never carries another site's markup.
 */
export function RichTextEditor({
	id,
	value,
	onChange,
	quotedHtml,
	disabled,
	placeholder,
	className,
	toolbarStart,
	toolbarEnd,
	footerContent,
}: RichTextEditorProps) {
	const { t } = useLanguage();
	const editorRef = useRef<HTMLDivElement | null>(null);
	const [active, setActive] = useState<Record<string, boolean>>({});
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkUrl, setLinkUrl] = useState("");
	const [showQuoted, setShowQuoted] = useState(false);
	const savedRange = useRef<Range | null>(null);

	// Keep the DOM in step with the value without resetting the caret on every keystroke.
	useEffect(() => {
		const element = editorRef.current;
		if (!element) {
			return;
		}
		const safeValue = sanitizeEditorHtml(value);
		if (element.innerHTML !== safeValue) {
			element.innerHTML = safeValue;
		}
	}, [value]);

	useEffect(() => {
		function refresh() {
			const element = editorRef.current;
			if (!element || !element.contains(document.activeElement)) {
				return;
			}
			const next: Record<string, boolean> = {};
			for (const item of COMMANDS) {
				next[item.command] =
					item.command === "formatBlock"
						? document.queryCommandValue("formatBlock").toLowerCase() ===
							"blockquote"
						: document.queryCommandState(item.command);
			}
			setActive(next);
		}
		document.addEventListener("selectionchange", refresh);
		return () => document.removeEventListener("selectionchange", refresh);
	}, []);

	function emit() {
		// Export validated original resource addresses, never the blocked preview placeholders.
		onChange(
			sanitizeEmailHtml(editorRef.current?.innerHTML ?? "", {
				forOutgoing: true,
			}) ?? ""
		);
	}

	function run(command: string, commandValue?: string) {
		editorRef.current?.focus();
		if (command === "formatBlock" && active.formatBlock) {
			document.execCommand("formatBlock", false, "div");
		} else {
			document.execCommand(command, false, commandValue);
		}
		emit();
	}

	function openLink() {
		const selection = window.getSelection();
		savedRange.current =
			selection && selection.rangeCount > 0
				? selection.getRangeAt(0).cloneRange()
				: null;
		setLinkUrl("");
		setLinkOpen(true);
	}

	function applyLink() {
		const url = linkUrl.trim();
		setLinkOpen(false);
		if (!url) {
			return;
		}
		const href = /^(?<capture1>https?:|mailto:)/iu.test(url)
			? url
			: `https://${url}`;
		editorRef.current?.focus();
		const selection = window.getSelection();
		if (savedRange.current && selection) {
			selection.removeAllRanges();
			selection.addRange(savedRange.current);
		}
		if (selection && selection.isCollapsed) {
			document.execCommand(
				"insertHTML",
				false,
				`<a href="${href.replaceAll('"', "&quot;")}">${href}</a>`
			);
		} else {
			document.execCommand("createLink", false, href);
		}
		emit();
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			openLink();
		}
	}

	const formatButtons = (
		<>
			{COMMANDS.map((item) => (
				<HintTooltip key={item.command} label={t(item.labelKey)}>
					<Toggle
						type="button"
						aria-label={t(item.labelKey)}
						pressed={!!active[item.command]}
						disabled={disabled}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => run(item.command, item.value)}
						className="shrink-0"
					>
						<item.icon />
					</Toggle>
				</HintTooltip>
			))}
			<Separator orientation="vertical" className="mx-1" />
			<HintTooltip label={t("editor.insertLinkHint")}>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					aria-label={t("editor.insertLink")}
					disabled={disabled}
					onMouseDown={(event) => event.preventDefault()}
					onClick={openLink}
					className="shrink-0"
				>
					<Link2 data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={t("editor.clearFormatting")}>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					aria-label={t("editor.clearFormatting")}
					disabled={disabled}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => run("removeFormat")}
					className="shrink-0"
				>
					<RemoveFormatting data-icon="inline-start" />
				</Button>
			</HintTooltip>
		</>
	);

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			{/* Scrolls sideways on narrow phones; the right edge fades instead of cutting a button in half. */}
			<div className="sticky top-0 z-10 flex shrink-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto overscroll-x-contain bg-card mask-r-from-90% py-1 pr-6 pl-2 md:hidden [&::-webkit-scrollbar]:hidden">
				{formatButtons}
			</div>
			<div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div
					ref={editorRef}
					id={id}
					// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Rich HTML editing needs contentEditable; textarea cannot preserve formatting.
					role="textbox"
					tabIndex={disabled ? -1 : 0}
					aria-multiline="true"
					aria-label={t("editor.messageBody")}
					contentEditable={!disabled}
					suppressContentEditableWarning
					data-placeholder={placeholder}
					onInput={emit}
					onBlur={emit}
					onPaste={onPaste}
					onKeyDown={onKeyDown}
					className={cn(
						"email-body max-w-none px-4 py-3 text-sm text-foreground outline-none [@media(pointer:coarse)]:text-base",
						"min-h-32 empty:before:pointer-events-none empty:before:text-muted-foreground/70 empty:before:content-[attr(data-placeholder)]",
						disabled && "cursor-not-allowed opacity-60"
					)}
				/>
				{quotedHtml && (
					<div className="px-4 pb-3">
						<Button
							variant="outline"
							size="icon-sm"
							type="button"
							onClick={() => setShowQuoted((open) => !open)}
							aria-expanded={showQuoted}
							aria-label={
								showQuoted ? t("editor.hideQuoted") : t("editor.showQuoted")
							}
							title={
								showQuoted ? t("editor.hideQuoted") : t("editor.showQuoted")
							}
						>
							<MoreHorizontal data-icon="inline-start" />
						</Button>
						{showQuoted && (
							<EmailHtmlRenderer
								className="mt-2"
								html={quotedHtml}
								preserveLeadingQuote
							/>
						)}
					</div>
				)}
			</div>
			{footerContent}
			<div className="relative flex items-center gap-0.5 border-t border-border px-4 py-3 max-md:gap-2 max-md:border-t-0">
				{toolbarStart}
				<div className="contents max-md:hidden">{formatButtons}</div>
				{toolbarEnd}
				{linkOpen && (
					<div className="absolute bottom-full left-2 z-10 mb-1 flex items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-lg">
						<Input
							inputMode="url"
							enterKeyHint="done"
							autoFocus
							value={linkUrl}
							onChange={(event) => setLinkUrl(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									applyLink();
								}
								if (event.key === "Escape") {
									setLinkOpen(false);
								}
							}}
							placeholder="https://example.com"
							aria-label={t("editor.insertLink")}
							className="w-48 sm:w-64"
						/>
						<Button size="sm" type="button" onClick={applyLink}>
							{t("editor.apply")}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
