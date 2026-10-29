"use client";

import Link from "next/link";

import { Wordmark } from "@/components/brand";
import { LanguageSelector } from "@/components/language-selector";
import {
	PageDescription,
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
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
			{/* oxlint-disable-next-line shadcn/no-arbitrary-values -- Standalone PWA header must clear the device status bar safe area. */}
			<header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 pt-safe sm:px-8">
				<Link
					href="/"
					className="flex min-h-20 items-center gap-2.5 rounded-md focus-visible:outline-ring"
				>
					<Wordmark />
				</Link>
				<LanguageSelector variant="text" />
			</header>
			{/* oxlint-disable-next-line shadcn/no-arbitrary-values -- The auth form must clear the home indicator while preserving its minimum page padding. */}
			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 pt-10 pb-safe-6 sm:px-8 sm:py-16 lg:grid lg:grid-cols-2 lg:items-start lg:gap-24 lg:py-28">
				<PageHeader className="min-w-0">
					<PageHeaderText className="gap-4">
						<PageTitle>{title}</PageTitle>
						{description && (
							<PageDescription className="max-w-md">
								{description}
							</PageDescription>
						)}
					</PageHeaderText>
				</PageHeader>
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
											: "text-muted-foreground"
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
					<div className="flex flex-1 flex-col [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&>form]:flex [&>form]:flex-1 [&>form]:flex-col">
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
