// A full reload, so a pull also picks up a new deploy; the spinner stays until the page unloads.
// Offline, the service worker answers the navigation from its cached copy of the page.
export function reloadPage(): Promise<never> {
	window.location.reload();
	// oxlint-disable-next-line promise/avoid-new -- A promise that never settles keeps the spinner until the page unloads.
	return new Promise<never>(() => {
		// Never settles.
	});
}
