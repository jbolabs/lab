import { requireSessionUser } from "@/lib/api/auth";
import { getEnv } from "@/lib/cloudflare";
import { getBrandLogo } from "@/lib/contacts/brand-logo";
import { isBrandLogoHostname } from "@/lib/contacts/brand-logo-utils";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const domain = (new URL(request.url).searchParams.get("domain") ?? "")
		.trim()
		.toLowerCase();
	if (!isBrandLogoHostname(domain)) {
		return new Response("Not found", { status: 404 });
	}

	const logo = await getBrandLogo(env, domain);
	if (!logo) {
		return new Response("Not found", {
			headers: { "Cache-Control": "private, max-age=86400" },
			status: 404,
		});
	}
	return new Response(logo.bytes, {
		headers: {
			"Cache-Control": "private, max-age=604800",
			// Third-party SVG: inert if opened directly instead of through <img>.
			"Content-Security-Policy":
				"default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
			"Content-Type": logo.contentType,
			"X-Content-Type-Options": "nosniff",
		},
	});
}
