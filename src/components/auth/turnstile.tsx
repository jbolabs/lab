"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

type TurnstileWindow = Window & {
	turnstile?: {
		render: (
			container: HTMLElement,
			options: {
				sitekey: string;
				callback: (token: string) => void;
				"expired-callback": () => void;
				"error-callback": () => void;
			}
		) => string;
		reset: (widgetId?: string) => void;
		remove: (widgetId?: string) => void;
	};
};

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function loadTurnstileScript(): Promise<void> {
	const existing = document.querySelector<HTMLScriptElement>(
		"script[data-turnstile]"
	);
	if (existing) {
		if (existing.dataset.loaded === "true") {
			return Promise.resolve();
		}
		// oxlint-disable-next-line promise/avoid-new -- Script load completion is a DOM event with no Promise API.
		return new Promise((resolve) => {
			existing.addEventListener("load", () => resolve(), { once: true });
		});
	}

	// oxlint-disable-next-line promise/avoid-new -- External script load and error events require a Promise adapter.
	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src =
			"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		script.async = true;
		script.defer = true;
		script.dataset.turnstile = "true";
		script.addEventListener("load", () => {
			script.dataset.loaded = "true";
			resolve();
		});
		script.addEventListener("error", () =>
			reject(new Error("Turnstile failed to load"))
		);
		// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare HTMLRewriter Element overload collides with DOM append; appendChild preserves the DOM Node type.
		document.head.appendChild(script);
	});
}

export function TurnstileField({
	name = "turnstileToken",
	resetSignal,
}: {
	name?: string;
	resetSignal?: number;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const widgetId = useRef<string | undefined>(undefined);
	const [token, setToken] = useState("");

	useEffect(() => {
		if (!TURNSTILE_SITE_KEY || !containerRef.current) {
			return;
		}
		let cancelled = false;

		void loadTurnstileScript()
			.then(() => {
				if (cancelled || !containerRef.current) {
					return null;
				}
				const { turnstile } = window as TurnstileWindow;
				if (!turnstile || widgetId.current) {
					return null;
				}
				widgetId.current = turnstile.render(containerRef.current, {
					callback: setToken,
					"error-callback": () => setToken(""),
					"expired-callback": () => setToken(""),
					sitekey: TURNSTILE_SITE_KEY,
				});
				return null;
			})
			.catch(() => {
				// The server rejects submissions without a valid challenge token.
			});

		return () => {
			cancelled = true;
			const { turnstile } = window as TurnstileWindow;
			if (turnstile && widgetId.current) {
				turnstile.remove(widgetId.current);
			}
			widgetId.current = undefined;
		};
	}, []);

	useEffect(() => {
		if (!resetSignal || !widgetId.current) {
			return;
		}
		(window as TurnstileWindow).turnstile?.reset(widgetId.current);
		setToken("");
	}, [resetSignal]);

	if (!TURNSTILE_SITE_KEY) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			<div ref={containerRef} />
			<Input type="hidden" name={name} value={token} />
		</div>
	);
}
