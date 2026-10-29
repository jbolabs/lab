"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { LanguageSelector } from "@/components/language-selector";
import { cn } from "@/lib/utils";
import type { AuthShellProps } from "./types";

export function AuthShell({
	title,
	description,
	children,
	footer,
	steps,
}: AuthShellProps) {
	return (
		<div className="flex min-h-svh flex-col bg-background text-foreground">
			<header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 pt-[env(safe-area-inset-top)] sm:px-8 [&_button]:min-h-11">
				<Link
					href="/"
					className="flex min-h-20 items-center gap-2.5 rounded-md focus-visible:outline-ring"
				>
					<Wordmark />
				</Link>
				<LanguageSelector variant="text" />
			</header>
			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:py-16 lg:grid lg:grid-cols-2 lg:items-start lg:gap-24 lg:py-28">
				<section className="min-w-0">
					<h1 className="text-balance font-display text-4xl font-extralight leading-tight tracking-[-0.03em] sm:text-5xl">
						{title}
					</h1>
					{description && (
						<p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
							{description}
						</p>
					)}
				</section>
				<section className="flex min-w-0 flex-1 flex-col lg:border-l lg:pl-10">
					{steps && (
						<ol className="mb-8 flex gap-3">
							{steps.map((step, index) => (
								<li
									key={step.label}
									aria-current={step.active ? "step" : undefined}
									className={cn(
										"flex min-w-0 flex-1 flex-col gap-2 border-t pt-3 text-xs",
										step.active
											? "border-foreground font-medium text-foreground"
											: "text-muted-foreground",
									)}
								>
									<span className="font-mono tabular-nums">
										{String(index + 1).padStart(2, "0")}
									</span>
									<span>{step.label}</span>
								</li>
							))}
						</ol>
					)}
					<div className="flex flex-1 flex-col [&>form]:flex [&>form]:flex-1 [&>form]:flex-col [&_input]:min-h-12 [&_input:not([name=code])]:text-base [&_[data-slot=input-group]]:h-12 [&_button:not([role=switch]):not([role=checkbox])]:min-h-11 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
						{children}
					</div>
					{footer && (
						<div className="mt-6 text-sm text-signal [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
							{footer}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
