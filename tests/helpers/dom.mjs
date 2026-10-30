// Base UI checks element types (HTMLElement, ShadowRoot, …) on the global scope and schedules
// work with requestAnimationFrame, so a jsdom window alone is not enough for components rendered here.
const DOM_GLOBALS = [
	"window",
	"document",
	"localStorage",
	"sessionStorage",
	"Node",
	"Element",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLFormElement",
	"HTMLButtonElement",
	"SVGElement",
	"ShadowRoot",
];

/** Exposes a jsdom window's DOM on globalThis; the returned function removes it again. */
export function installDomGlobals(dom) {
	for (const name of DOM_GLOBALS) {
		try {
			globalThis[name] = name === "window" ? dom.window : dom.window[name];
		} catch {
			// Storage throws on an opaque (URL-less) jsdom origin; those tests do not use it.
		}
	}
	const ownsFrames = !globalThis.requestAnimationFrame;
	if (ownsFrames) {
		globalThis.requestAnimationFrame = (callback) =>
			setTimeout(() => callback(performance.now()), 0);
		globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
	}
	return () => {
		for (const name of DOM_GLOBALS) {
			Reflect.deleteProperty(globalThis, name);
		}
		if (ownsFrames) {
			delete globalThis.requestAnimationFrame;
			delete globalThis.cancelAnimationFrame;
		}
	};
}
