import type { NextConfig } from "next";

import { getSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
	allowedDevOrigins: ["mail.dev"],
	distDir: process.env.MAILFLARE_RUNTIME === "node" ? ".next-node" : undefined,
	headers() {
		try {
			return Promise.resolve([
				{
					headers: getSecurityHeaders(),
					source: "/(.*)",
				},
			]);
		} catch (error) {
			return Promise.reject(error);
		}
	},
	// Native and server-only packages used by the self-hosted runtime; never bundle them.
	serverExternalPackages: ["better-sqlite3", "nodemailer", "smtp-server", "ws"],
	turbopack: {
		resolveAlias:
			process.env.MAILFLARE_RUNTIME === "node"
				? {
						"cloudflare:workers": "./server/runtime/cloudflare-workers.ts",
					}
				: {},
		root: import.meta.dirname,
	},
	typescript: {
		// !! WARN !!
		// Dangerously allow production builds to successfully complete
		// even if your project has type errors.
		ignoreBuildErrors: true,
	},
};

export default nextConfig;
