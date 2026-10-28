"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { HeaderSearchProps } from "./header-search-types";

// The header search shared by every layout. On phones it is an icon beside the menu button
// until tapped, then covers the header at full width; the wrapper still fills the row so
// whatever follows it stays pushed to the right.
export function HeaderSearch({ value, onChange, label, placeholder, onSubmit, trailing, inputProps, mobileEnd }: HeaderSearchProps) {
	const [expanded, setExpanded] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (expanded) inputRef.current?.focus();
	}, [expanded]);

	return (
		<div className={clsx("flex min-w-0 flex-1 items-center", mobileEnd && !expanded && "max-md:justify-end")}>
			<button
				type="button"
				onClick={() => setExpanded(true)}
				aria-label={label}
				className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-accent md:hidden", value ? "bg-signal-soft text-signal" : "text-muted-foreground", expanded && "hidden")}
			>
				<Search className="h-5 w-5" />
			</button>
			<form
				role="search"
				onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}
				className={clsx("h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-signal-soft px-4 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30 transition-all md:flex", expanded ? "flex max-md:fixed max-md:inset-x-2 max-md:top-2 max-md:z-[60] max-md:shadow-md" : "max-md:hidden")}
			>
				<Search className="h-5 w-5 shrink-0" />
				<Input
					ref={inputRef}
					{...inputProps}
					onBlur={() => setExpanded(false)}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					aria-label={label}
					placeholder={placeholder ?? label}
					className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none! shadow-none! border-none! placeholder:text-muted-foreground"
				/>
				{trailing}
			</form>
		</div>
	);
}
