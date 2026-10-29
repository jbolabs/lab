import type { ComponentProps } from "react";

/** Cookie-authenticated attachment URLs must be fetched directly by the browser on Workers. */
export function AttachmentImage({
	alt,
	...props
}: ComponentProps<"img"> & { alt: string }) {
	// oxlint-disable-next-line next/no-img-element -- next/image optimization cannot forward attachment authentication or load browser blob URLs on vinext/Workers.
	return <img alt={alt} {...props} />;
}
