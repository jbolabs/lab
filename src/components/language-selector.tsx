"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	NativeSelect,
	NativeSelectOption,
} from "@/components/ui/native-select";
import { locales, supportedLocales } from "@/lib/i18n/locales";
import { resolveLocale } from "@/lib/i18n/utils";

import { useLanguage } from "./language-provider";

export function LanguageSelector({
	variant = "field",
}: {
	variant?: "field" | "text";
}) {
	const id = useId();
	const { locale, setLocale, t } = useLanguage();
	if (variant === "text") {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="ghost" />}>
					{/* The visible language name leads the accessible name, so voice control can say it. */}
					{locales[locale].label}
					<span className="sr-only">, {t("language.label")}</span>
					<ChevronDown data-icon="inline-end" />
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
	}
	return (
		<Field className="gap-1 px-1">
			<FieldLabel htmlFor={id}>{t("language.label")}</FieldLabel>
			<NativeSelect
				id={id}
				value={locale}
				onChange={(event) => setLocale(resolveLocale(event.target.value))}
				containerClassName="w-full"
			>
				{supportedLocales.map((value) => (
					<NativeSelectOption key={value} value={value} lang={value}>
						{locales[value].label}
					</NativeSelectOption>
				))}
			</NativeSelect>
		</Field>
	);
}
