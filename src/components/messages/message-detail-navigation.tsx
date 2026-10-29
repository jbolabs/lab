"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { HintTooltip } from "@/components/hint-tooltip";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { authFetch } from "@/lib/auth/client";
import type { MessageNavigationResponse } from "@/app/api/messages/navigation/types";
import type { MessageDetailNavigationContextValue, MessageDetailNavigationProps, MessageDetailNavigationProviderProps, MessageDetailNavigationSnapshot, OpenedUnreadMessages } from "./message-detail-navigation-types";
import { getMessageDetailNavigationState, takeOpenedUnreadMessage } from "./message-detail-navigation-utils";
import { useConversationView } from "./use-conversation-view";
import { haptic } from "@/lib/haptics";
import { isEdgeSwipeStart } from "@/lib/edge-swipe-utils";

const NavigationContext = createContext<MessageDetailNavigationContextValue | null>(null);

export function MessageDetailNavigationProvider({ children, config }: MessageDetailNavigationProviderProps) {
	const { selectedMailbox, isLoading: mailboxesLoading } = useSelectedMailbox();
	const [conversationView] = useConversationView();
	const grouped = conversationView && config.folder !== "drafts";
	const mailboxId = selectedMailbox?.id;
	const key = `${config.folder}:${config.folderId ?? ""}:${mailboxId ?? "all"}:${grouped}`;
	const [snapshot, setSnapshot] = useState<MessageDetailNavigationSnapshot>({ key: "", entries: [] });
	const [openedUnread, setOpenedUnread] = useState<OpenedUnreadMessages>({ key: "", ids: new Set() });
	const recordUnread = useCallback((messageId: string) => {
		setOpenedUnread((current) => {
			const ids = new Set(current.key === key ? current.ids : []);
			ids.add(messageId);
			return { key, ids };
		});
	}, [key]);

	useEffect(() => {
		const messageId = takeOpenedUnreadMessage();
		if (messageId) recordUnread(messageId);
	}, [recordUnread]);

	useEffect(() => {
		if (mailboxesLoading) return;
		let cancelled = false;
		const params = new URLSearchParams({ folder: config.folder });
		if (config.folderId) params.set("folderId", config.folderId);
		if (mailboxId) params.set("mailboxId", mailboxId);
		if (grouped) params.set("group", "thread");
		void authFetch(`/api/messages/navigation?${params.toString()}`)
			.then((response) => {
				if (!response.ok) throw new Error("Unable to load message navigation");
				return response.json() as Promise<MessageNavigationResponse>;
			})
			.then((response) => {
				if (!cancelled) setSnapshot({ key, entries: response.messages });
			})
			.catch(() => {
				if (!cancelled) setSnapshot({ key, entries: [] });
			});
		return () => { cancelled = true; };
	}, [config.folder, config.folderId, grouped, key, mailboxId, mailboxesLoading]);

	const unreadIds = openedUnread.key === key ? openedUnread.ids : null;
	const entries = snapshot.key === key
		? snapshot.entries.map((entry) => ({ ...entry, unread: entry.unread || !!unreadIds?.has(entry.id) }))
		: [];
	return <NavigationContext.Provider value={{ entries, hrefPrefix: config.hrefPrefix, recordUnread }}>{children}</NavigationContext.Provider>;
}

export function MessageDetailNavigation({ messageId, unread }: MessageDetailNavigationProps) {
	const { t } = useLanguage();
	const context = useContext(NavigationContext);
	const router = useRouter();
	useEffect(() => {
		if (unread) context?.recordUnread(messageId);
	}, [context?.recordUnread, messageId, unread]);
	if (!context) return null;
	const { previousId, nextId, unreadOrder, totalUnread } = getMessageDetailNavigationState(context.entries, messageId);

	return (
		<div className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
			{totalUnread > 0 && (
			<span className="mr-2 hidden whitespace-nowrap text-xs sm:inline" aria-live="polite">
				{t("message.nav.unreadPosition", { position: unreadOrder, total: totalUnread })}
			</span>
			)}
			<HintTooltip label={t("message.nav.newer")}>
				<Button type="button" variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label={t("message.nav.newer")} disabled={!previousId} onClick={() => previousId && router.push(`${context.hrefPrefix}/${previousId}`)}>
					<ChevronLeft data-icon="inline-start" />
				</Button>
			</HintTooltip>
			<HintTooltip label={t("message.nav.older")}>
				<Button type="button" variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label={t("message.nav.older")} disabled={!nextId} onClick={() => nextId && router.push(`${context.hrefPrefix}/${nextId}`)}>
					<ChevronRight data-icon="inline-start" />
				</Button>
			</HintTooltip>
		</div>
	);
}

const SWIPE_COMMIT_DISTANCE = 96;

// Whether an element under the finger can still scroll horizontally that way (a wide table, code);
// if so the swipe is its, as in a native reader.
function canScrollHorizontally(path: EventTarget[], stopAt: HTMLElement, dx: number) {
	for (const target of path) {
		if (!(target instanceof HTMLElement)) continue;
		if (target.scrollWidth > target.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(target).overflowX)) {
			if (dx < 0 && target.scrollLeft + target.clientWidth < target.scrollWidth - 1) return true;
			if (dx > 0 && target.scrollLeft > 0) return true;
		}
		if (target === stopAt) break;
	}
	return false;
}

/** Phones: swipe the open message sideways to reach the newer (right) or older (left) one, as in Gmail. */
export function useMessageSwipeNavigation(scroller: RefObject<HTMLElement | null>, messageId: string, ready: boolean) {
	const context = useContext(NavigationContext);
	const router = useRouter();
	const { previousId, nextId } = context ? getMessageDetailNavigationState(context.entries, messageId) : { previousId: null, nextId: null };
	const hrefs = useRef({ newer: null as string | null, older: null as string | null });
	hrefs.current = {
		newer: context && previousId ? `${context.hrefPrefix}/${previousId}` : null,
		older: context && nextId ? `${context.hrefPrefix}/${nextId}` : null,
	};

	useEffect(() => {
		const element = scroller.current;
		if (!element || !ready) return;
		const target = element;
		target.style.transform = "";
		target.style.opacity = "";
		target.style.transition = "";
		let start: { x: number; y: number } | null = null;
		let state: "pending" | "swiping" | "ignored" = "pending";
		let dx = 0;
		let armed = false;

		function setVisual(x: number, animate: boolean) {
			target.style.transition = animate ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease-out" : "none";
			target.style.transform = x ? `translateX(${x}px)` : "";
			target.style.opacity = x ? String(Math.max(0.4, 1 - Math.abs(x) / target.clientWidth)) : "";
		}
		function onTouchStart(event: TouchEvent) {
			const touch = event.touches[0];
			start = event.touches.length === 1 && !isEdgeSwipeStart(touch.clientX) ? { x: touch.clientX, y: touch.clientY } : null;
			state = "pending";
			dx = 0;
			armed = false;
		}
		function onTouchMove(event: TouchEvent) {
			if (!start || state === "ignored") return;
			const touch = event.touches[0];
			const moveX = touch.clientX - start.x;
			const moveY = touch.clientY - start.y;
			if (state === "pending") {
				if (Math.abs(moveY) > 10 && Math.abs(moveY) > Math.abs(moveX)) { state = "ignored"; return; }
				if (Math.abs(moveX) < 12) return;
				if (canScrollHorizontally(event.composedPath(), target, moveX)) { state = "ignored"; return; }
				state = "swiping";
			}
			const destination = moveX > 0 ? hrefs.current.newer : hrefs.current.older;
			// No message that way: resist, like the end of a native pager.
			dx = destination ? moveX : moveX * 0.2;
			const nowArmed = !!destination && Math.abs(dx) >= SWIPE_COMMIT_DISTANCE;
			if (nowArmed !== armed) {
				armed = nowArmed;
				haptic("selection");
			}
			setVisual(dx, false);
		}
		function onTouchEnd() {
			if (state !== "swiping") return;
			const destination = dx > 0 ? hrefs.current.newer : hrefs.current.older;
			if (armed && destination) {
				haptic("impact");
				setVisual(Math.sign(dx) * target.clientWidth, true);
				router.push(destination);
			} else {
				setVisual(0, true);
			}
			start = null;
			state = "pending";
		}
		// An interrupted gesture never navigates; it only springs back.
		function onTouchCancel() {
			if (state === "swiping") setVisual(0, true);
			start = null;
			state = "pending";
		}

		target.addEventListener("touchstart", onTouchStart, { passive: true });
		target.addEventListener("touchmove", onTouchMove, { passive: true });
		target.addEventListener("touchend", onTouchEnd, { passive: true });
		target.addEventListener("touchcancel", onTouchCancel, { passive: true });
		return () => {
			target.removeEventListener("touchstart", onTouchStart);
			target.removeEventListener("touchmove", onTouchMove);
			target.removeEventListener("touchend", onTouchEnd);
			target.removeEventListener("touchcancel", onTouchCancel);
			target.style.transform = "";
			target.style.opacity = "";
			target.style.transition = "";
		};
	}, [scroller, messageId, ready, router]);
}
