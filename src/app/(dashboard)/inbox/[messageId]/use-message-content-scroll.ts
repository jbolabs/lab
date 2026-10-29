import { useRef, useState } from "react";

export function useMessageContentScroll() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrolled, setScrolled] = useState(false);

	function handleScroll() {
		setScrolled((scrollRef.current?.scrollTop ?? 0) > 0);
	}

	return { handleScroll, scrollRef, scrolled };
}
