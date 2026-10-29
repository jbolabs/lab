"use client";

import { usePathname } from "next/navigation";
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
	useMemo,
} from "react";
import type { CSSProperties } from "react";

import { useAssistantOpen } from "@/components/agent/assistant-open-state";
import {
	readColumnWidth,
	readInitialColumnWidth,
	saveColumnWidth,
} from "@/components/column-width-preferences";
import { useLanguage } from "@/components/language-provider";
import { useSidebar } from "@/components/sidebar-state";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { subscribeToStorage } from "@/hooks/storage-subscription";
import { useMessageField } from "@/hooks/use-message-field";

import { BulkMessageSelectionPane } from "./bulk-message-selection-pane";
import { MessageDetailNavigationProvider } from "./message-detail-navigation";
import { MessageFolderPage } from "./message-folder-page";
import { MessageListVisibilityContext } from "./message-list-visibility";
import {
	readInitialMessageListVisible,
	saveMessageListVisible,
} from "./message-list-visibility-utils";
import type {
	MessageListVisibility,
	MessageSplitLayoutProps,
	SelectedMessage,
} from "./types";
import { useTwoColumnReading } from "./use-two-column-reading";

export function MessageSplitLayout({
	children,
	config,
}: MessageSplitLayoutProps) {
	const pathname = usePathname();
	const [selectedMessages, setSelectedMessages] = useState<SelectedMessage[]>(
		[]
	);
	const { userId, setForcedMinimal } = useSidebar();
	const storedWidth = useSyncExternalStore(
		subscribeToStorage,
		() => {
			const initial = readInitialColumnWidth("message-list", 360, 250, 1200);
			return userId
				? readColumnWidth(userId, "message-list", initial, 250, 1200)
				: initial;
		},
		() => 360
	);
	const [listWidth, setListWidth] = useMessageField(storedWidth);
	const [widthReady, setWidthReady] = useState(false);
	const [containerWidth, setContainerWidth] = useState(0);
	const savedVisible = useSyncExternalStore(
		subscribeToStorage,
		readInitialMessageListVisible,
		() => true
	);
	const [manualListVisible, setManualListVisible] =
		useMessageField(savedVisible);
	const [twoColumnReading] = useTwoColumnReading();
	const containerRef = useRef<HTMLDivElement>(null);
	const startWidth = useRef(listWidth);
	const resizedWidth = useRef(listWidth);
	const { t } = useLanguage();
	const assistantOpen = useAssistantOpen();
	const listVisible = twoColumnReading && !assistantOpen && manualListVisible;
	const detailPrefix = `${config.hrefPrefix}/`;
	const selectedMessageId = pathname.startsWith(detailPrefix)
		? pathname.slice(detailPrefix.length).split("/")[0]
		: undefined;
	const renderedListWidth = Math.max(
		250,
		Math.min(listWidth, (containerWidth || 1000) - 280)
	);

	useLayoutEffect(() => {
		const frame = requestAnimationFrame(() => setWidthReady(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	useEffect(() => {
		if (!userId) {
			return;
		}
		saveColumnWidth(userId, "message-list", storedWidth);
	}, [userId, storedWidth]);

	useLayoutEffect(() => {
		if (!selectedMessageId) {
			setForcedMinimal(false);
			return;
		}
		const container = containerRef.current;
		if (!container) {
			return;
		}
		setContainerWidth(container.clientWidth);
		const observer = new ResizeObserver(() =>
			setContainerWidth(container.clientWidth)
		);
		observer.observe(container);
		return () => observer.disconnect();
	}, [selectedMessageId, setForcedMinimal]);

	useEffect(() => () => setForcedMinimal(false), [setForcedMinimal]);

	const contextValue = useMemo<MessageListVisibility>(
		() => ({
			backHref: config.hrefPrefix,
			backLabel: config.titleKey ? t(config.titleKey) : config.title,
			singleColumn: !twoColumnReading,
			toggle: () => {
				const visible = !manualListVisible;
				setManualListVisible(visible);
				saveMessageListVisible(visible);
			},
			visible: listVisible,
		}),
		[
			config.hrefPrefix,
			config.titleKey,
			config.title,
			t,
			twoColumnReading,
			manualListVisible,
			setManualListVisible,
			listVisible,
		]
	);
	if (!selectedMessageId) {
		return children;
	}
	return (
		<div
			ref={containerRef}
			className="h-full min-h-0 [grid-template-columns:var(--mf-grid-template-columns)] overflow-hidden duration-(--mf-transition-duration) motion-reduce:transition-none lg:grid lg:transition-all lg:ease-in-out"
			style={
				{
					"--mf-grid-template-columns": twoColumnReading
						? `${listVisible ? renderedListWidth : 0}px minmax(0,1fr)`
						: "minmax(0,1fr)",
					"--mf-transition-duration": widthReady ? "300ms" : "0ms",
				} as CSSProperties
			}
		>
			{twoColumnReading && (
				<aside
					className={`relative hidden min-h-0 min-w-0 overflow-hidden bg-card lg:block ${listVisible ? "border-r border-border" : "pointer-events-none"}`}
					aria-hidden={!listVisible}
					inert={!listVisible}
				>
					<div
						className={`[width:var(--mf-width)] ${`h-full overflow-hidden transition-transform duration-300 ease-in-out motion-reduce:transition-none ${listVisible ? "translate-x-0" : "-translate-x-full"}`}`}
						style={
							{
								"--mf-width": `${renderedListWidth}px`,
							} as CSSProperties
						}
					>
						<MessageFolderPage
							config={config}
							compact
							selectedMessageId={selectedMessageId}
							selection={{ selectedMessages, setSelectedMessages }}
						/>
					</div>
					<ResizeHandle
						label={t("list.resize")}
						onResizeStart={() => {
							startWidth.current = listWidth;
							resizedWidth.current = listWidth;
						}}
						onResize={(delta) => {
							const requestedWidth = startWidth.current + delta;
							setForcedMinimal(requestedWidth < 250);
							resizedWidth.current = Math.max(
								250,
								Math.min(
									requestedWidth,
									Math.max(
										250,
										(containerRef.current?.clientWidth ?? 1000) - 280
									)
								)
							);
							setListWidth(resizedWidth.current);
						}}
						onResizeEnd={() =>
							saveColumnWidth(userId, "message-list", resizedWidth.current)
						}
					/>
				</aside>
			)}
			<MessageListVisibilityContext.Provider value={contextValue}>
				<MessageDetailNavigationProvider config={config}>
					<section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
						{twoColumnReading && selectedMessages.length > 0 ? (
							<BulkMessageSelectionPane
								folder={config.folder}
								selectedMessages={selectedMessages}
								onClearSelection={() => setSelectedMessages([])}
							/>
						) : (
							children
						)}
					</section>
				</MessageDetailNavigationProvider>
			</MessageListVisibilityContext.Provider>
		</div>
	);
}
