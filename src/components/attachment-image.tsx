import type { ComponentProps } from "react";

/** Cookie-authenticated attachment URLs must be fetched directly by the browser on Workers. */
export function AttachmentImage({
	alt,
	...props
}: ComponentProps<"img"> & { alt: string }) {
	return <img alt={alt} {...props} />;
}
