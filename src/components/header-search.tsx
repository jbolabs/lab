"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
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
	const [expanded, setExpanded] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (expanded) inputRef.current?.focus();
	}, [expanded]);
	return (
		<div
			className={cn(
				"flex min-w-0 flex-1 items-center",
				mobileEnd && !expanded && "max-md:justify-end",
			)}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={() => setExpanded(true)}
				aria-label={label}
				className={cn("size-11 shrink-0 md:hidden", expanded && "hidden")}
			>
				<Search />
			</Button>
			<form
				role="search"
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node))
						setExpanded(false);
				}}
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit?.();
				}}
				className={cn(
					"min-w-0 flex-1 md:block md:max-w-2xl",
					expanded
						? "max-md:fixed max-md:inset-x-2 max-md:top-[calc(env(safe-area-inset-top)+0.375rem)] max-md:z-40"
						: "max-md:hidden",
				)}
			>
				<InputGroup className="h-10 max-md:h-11 bg-background">
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
			</form>
		</div>
	);
}
