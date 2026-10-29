import * as React from "react";

import { cn } from "@/lib/utils";

// The one page title treatment for settings, admin, calendar, drive and auth pages:
// <PageHeader><PageHeaderText><PageTitle/><PageDescription/></PageHeaderText><PageHeaderActions/></PageHeader>.
export function PageHeader({
	className,
	...props
}: React.ComponentProps<"header">) {
	return (
		<header
			data-slot="page-header"
			className={cn(
				"flex flex-wrap items-start justify-between gap-4",
				className
			)}
			{...props}
		/>
	);
}

export function PageHeaderText({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-header-text"
			className={cn("flex min-w-0 flex-col gap-2", className)}
			{...props}
		/>
	);
}

// size="sm" is for titles that share a toolbar row (drive breadcrumbs, document and public share titles).
export function PageTitle({
	className,
	children,
	size = "default",
	...props
}: React.ComponentProps<"h1"> & { size?: "default" | "sm" }) {
	return (
		<h1
			data-slot="page-title"
			data-size={size}
			className={cn(
				"font-heading text-2xl font-medium tracking-tight text-balance text-foreground data-[size=sm]:text-lg data-[size=sm]:font-medium data-[size=sm]:tracking-normal md:text-3xl data-[size=sm]:md:text-xl",
				className
			)}
			{...props}
		>
			{children}
		</h1>
	);
}

export function PageDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="page-description"
			className={cn("max-w-2xl text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function PageHeaderActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-header-actions"
			className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
			{...props}
		/>
	);
}
