"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBranding } from "@/components/branding-provider";
import { useLanguage } from "@/components/language-provider";
import { PageLoadingContext } from "@/components/page-loading";
import { RouteLoadingBar } from "@/components/route-loading-bar";
import { Progress } from "@/components/ui/progress";

import type { LoadingTransitionProps } from "./loading-transition-types";

const MINIMUM_LOADING_TIME = 600;
const COMPLETION_TIME = 220;
const MAXIMUM_DATA_WAIT = 10_000;
let hasShownInitialLoadingTransition = false;

export function LoadingTransition({ children, ready }: LoadingTransitionProps) {
	const { t } = useLanguage();
	const branding = useBranding();
	// oxlint-disable-next-line react/hook-use-state -- This lazy mount snapshot is intentionally immutable and has no setter.
	const [showInitialLoader] = useState(() => !hasShownInitialLoadingTransition);
	// oxlint-disable-next-line react/hook-use-state -- This lazy mount snapshot is intentionally immutable and has no setter.
	const [startedAt] = useState(() => Date.now());
	const [progress, setProgress] = useState(8);
	const [loaderVisible, setLoaderVisible] = useState(showInitialLoader);
	const [contentVisible, setContentVisible] = useState(!showInitialLoader);
	const [initialLoadComplete, setInitialLoadComplete] =
		useState(!showInitialLoader);
	const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
	const iconUrl =
		failedIconUrl === branding.iconUrl ? "/icon-96.png" : branding.iconUrl;
	const [pageMounted, setPageMounted] = useState(false);
	const [pendingLoads, setPendingLoads] = useState(0);
	const [dataWaitExpired, setDataWaitExpired] = useState(false);
	const loadingIds = useRef(new Set<string>());
	const fetchingQueries = useIsFetching();

	const reportLoading = useCallback((id: string, loading: boolean) => {
		if (loading) {
			loadingIds.current.add(id);
		} else {
			loadingIds.current.delete(id);
		}
		setPendingLoads(loadingIds.current.size);
	}, []);
	const loadingContext = useMemo(() => ({ reportLoading }), [reportLoading]);
	const canComplete =
		ready &&
		pageMounted &&
		(dataWaitExpired || (pendingLoads === 0 && fetchingQueries === 0));

	useEffect(() => {
		if (canComplete) {
			return;
		}
		const timer = window.setInterval(() => {
			setProgress((current) =>
				Math.min(92, current + Math.max(1, (92 - current) * 0.08))
			);
		}, 90);
		return () => window.clearInterval(timer);
	}, [canComplete]);

	useEffect(() => {
		if (!ready) {
			return;
		}
		const timer = window.setTimeout(() => setPageMounted(true), 50);
		return () => window.clearTimeout(timer);
	}, [ready]);

	useEffect(() => {
		if (!ready) {
			return;
		}
		const timer = window.setTimeout(
			() => setDataWaitExpired(true),
			MAXIMUM_DATA_WAIT
		);
		return () => window.clearTimeout(timer);
	}, [ready]);

	useEffect(() => {
		if (!canComplete) {
			return;
		}
		const remaining = showInitialLoader
			? Math.max(0, MINIMUM_LOADING_TIME - (Date.now() - startedAt))
			: 0;
		const completeTimer = window.setTimeout(() => setProgress(100), remaining);
		const revealTimer = window.setTimeout(() => {
			if (showInitialLoader) {
				hasShownInitialLoadingTransition = true;
				setLoaderVisible(false);
				setContentVisible(true);
			}
			setInitialLoadComplete(true);
		}, remaining + COMPLETION_TIME);
		return () => {
			window.clearTimeout(completeTimer);
			window.clearTimeout(revealTimer);
		};
	}, [canComplete, showInitialLoader, startedAt]);

	const showTopLoadingBar = initialLoadComplete && (!ready || pendingLoads > 0);

	return (
		<PageLoadingContext.Provider value={loadingContext}>
			<div className="relative min-h-dvh bg-sidebar">
				{showTopLoadingBar && <RouteLoadingBar />}
				{ready && (
					<div
						className={`min-h-dvh transition-opacity duration-300 ${contentVisible ? "opacity-100" : "opacity-0"}`}
					>
						{children}
					</div>
				)}
				<output
					data-app-loader
					className={`fixed inset-0 z-100 flex items-center justify-center bg-sidebar transition-opacity duration-300 ${
						loaderVisible ? "opacity-100" : "pointer-events-none opacity-0"
					}`}
				>
					<span className="sr-only">
						{loaderVisible ? t("nav.loading") : ""}
					</span>
					<div
						aria-hidden="true"
						className="flex w-64 flex-col items-center gap-6"
					>
						<img
							src={iconUrl}
							onError={() => setFailedIconUrl(branding.iconUrl)}
							alt=""
							className="size-20 rounded-lg object-contain"
						/>
						<Progress value={progress} className="h-1 w-full" />
					</div>
				</output>
			</div>
		</PageLoadingContext.Provider>
	);
}
