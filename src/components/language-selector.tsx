"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { locales, supportedLocales } from "@/lib/i18n/locales";
import { resolveLocale } from "@/lib/i18n/utils";
import { useLanguage } from "./language-provider";
import { Button } from "@/components/ui/button";

import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export function LanguageSelector({
	variant = "field",
}: {
	variant?: "field" | "text";
}) {
	const id = useId();
	const { locale, setLocale, t } = useLanguage();
	const options = supportedLocales.map((value) => (
		<option key={value} value={value} lang={value}>
			{locales[value].label}
		</option>
	));
	if (variant === "text")
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="min-h-11"
						aria-label={t("language.label")}
					>
						{locales[locale].label}
						<ChevronDown data-icon="inline-end" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuRadioGroup
						value={locale}
						onValueChange={(value) => setLocale(resolveLocale(value))}
					>
						{supportedLocales.map((value) => (
							<DropdownMenuRadioItem key={value} value={value} lang={value}>
								{locales[value].label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	return (
		<div className="flex flex-col gap-1 px-1">
			<label htmlFor={id} className="text-xs text-muted-foreground">
				{t("language.label")}
			</label>
			<select
				id={id}
				value={locale}
				onChange={(event) => setLocale(resolveLocale(event.target.value))}
				className="min-h-11 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				{options}
			</select>
		</div>
	);
}
