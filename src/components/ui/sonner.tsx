"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
	// The app's theme is a class on <html> (theme-utils.ts), not next-themes.
	const [theme, setTheme] = useState<"light" | "dark">("light");
	useEffect(() => {
		const root = document.documentElement;
		const sync = () =>
			setTheme(root.classList.contains("dark") ? "dark" : "light");
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(root, { attributeFilter: ["class"], attributes: true });
		return () => observer.disconnect();
	}, []);

	return (
		<Sonner
			theme={theme}
			position="bottom-center"
			offset={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
			// Phones: sit above the floating Compose button (min-h-14 plus its gap) so toast actions never land on it.
			mobileOffset={{
				bottom: "calc(max(1rem, env(safe-area-inset-bottom)) + 4.5rem)",
			}}
			className="group"
			icons={{
				error: <OctagonXIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
				success: <CircleCheckIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
			}}
			style={
				{
					"--border-radius": "var(--radius-2xl)",
					"--normal-bg": "var(--popover)",
					"--normal-border": "var(--border)",
					"--normal-text": "var(--popover-foreground)",
				} as React.CSSProperties
			}
			// Sonner's own stylesheet squares off its buttons with a higher-specificity selector, hence `!`.
			toastOptions={{
				classNames: {
					actionButton: "h-7! rounded-4xl! px-3! font-medium!",
					cancelButton: "h-7! rounded-4xl! px-3! font-medium!",
					closeButton: "rounded-full!",
				},
			}}
			{...props}
		/>
	);
}

export { Toaster };
