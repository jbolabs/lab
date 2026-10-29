"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

import type { HeaderSearchProps } from "./header-search-types";

export function HeaderSearch({
	value,
	onChange,
	label,
	placeholder,
	onSubmit,
	trailing,
	inputProps,
	mobileEnd,
}: HeaderSearchProps) {
	const { t } = useLanguage();
	const [expanded, setExpanded] = useState(false);
	// An active query keeps the bar open after the keyboard closes, so a filtered list is never unexplained.
	const open = expanded || value.length > 0;
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (expanded) {
			inputRef.current?.focus();
		}
	}, [expanded]);
	return (
		<div
			className={cn(
				"flex min-w-0 flex-1 items-center",
				mobileEnd && !open && "max-md:justify-end"
			)}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={() => setExpanded(true)}
				aria-label={label}
				className={cn("shrink-0 md:hidden", open && "hidden")}
			>
				<Search />
			</Button>
			<search className="contents">
				<div
					className="contents"
					onBlur={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node)) {
							setExpanded(false);
						}
					}}
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							onSubmit?.();
						}}
						// Phones: the open field takes over the whole header bar on its own surface, with Cancel, as iOS search does.
						className={cn(
							"min-w-0 flex-1 md:block md:max-w-2xl",
							open
								? "max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-40 max-md:flex max-md:min-h-safe-header max-md:animate-in max-md:items-center max-md:gap-1 max-md:border-b max-md:border-sidebar-border max-md:bg-sidebar max-md:pt-safe max-md:pr-1 max-md:pl-3 max-md:duration-150 max-md:fade-in-0"
								: "max-md:hidden"
						)}
					>
						<InputGroup>
							<InputGroupInput
								ref={inputRef}
								type="search"
								enterKeyHint="search"
								autoComplete="off"
								{...inputProps}
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										setExpanded(false);
										inputRef.current?.blur();
									}
								}}
								value={value}
								onChange={(event) => onChange(event.target.value)}
								aria-label={label}
								placeholder={placeholder ?? label}
							/>
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							{trailing && (
								<InputGroupAddon align="inline-end">{trailing}</InputGroupAddon>
							)}
						</InputGroup>
						<Button
							type="button"
							variant="ghost"
							className="shrink-0 md:hidden"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								onChange("");
								setExpanded(false);
							}}
						>
							{t("common.cancel")}
						</Button>
					</form>
				</div>
			</search>
		</div>
	);
}
