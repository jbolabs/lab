import * as React from "react";
import { cn } from "@/lib/utils";

// Settings and admin sections are stacked under one page heading, so a Card here is a
// hairline-separated section rather than a boxed panel.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card" className={cn("border-t text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 py-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
	return <h3 data-slot="card-title" className={cn("font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
	return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-content" className={cn("pb-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div data-slot="card-footer" className={cn("flex items-center pt-6", className)} {...props} />;
}
