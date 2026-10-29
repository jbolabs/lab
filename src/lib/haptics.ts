// Haptic feedback for touch screens. Android exposes navigator.vibrate; iOS Safari does not, but since
// iOS 18 toggling an <input type="checkbox" switch> plays the system selection tick, so a hidden
// switch is clicked instead. Both only fire inside a user gesture (pointerup, click, touchend), and
// iOS has a single strength, so `kind` only changes the pattern on Android.

export type HapticKind = "selection" | "impact" | "success";

const vibrationPatterns: Record<HapticKind, number | number[]> = {
	impact: 16,
	selection: 8,
	success: [10, 60, 14],
};

let iosSwitch: HTMLLabelElement | null = null;

function getIosSwitch() {
	if (iosSwitch?.isConnected) {
		return iosSwitch;
	}
	const label = document.createElement("label");
	label.setAttribute("aria-hidden", "true");
	label.style.display = "none";
	const input = document.createElement("input");
	input.type = "checkbox";
	input.setAttribute("switch", "");
	input.tabIndex = -1;
	// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
	label.appendChild(input);
	// oxlint-disable-next-line unicorn/prefer-dom-node-append -- Cloudflare Element overloads shadow DOM append; appendChild retains the DOM node signature.
	document.body.appendChild(label);
	iosSwitch = label;
	return label;
}

export function haptic(kind: HapticKind = "selection") {
	if (
		typeof window === "undefined" ||
		!window.matchMedia("(pointer: coarse)").matches
	) {
		return;
	}
	if (typeof navigator.vibrate === "function") {
		navigator.vibrate(vibrationPatterns[kind]);
		return;
	}
	getIosSwitch().click();
}
