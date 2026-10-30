import { build } from "esbuild";

// Bundle the self-hosted entrypoint (server/index.ts) and the app modules it
// pulls in. Native modules and network libraries stay external and are
// resolved from node_modules at runtime.
await build({
	alias: { "cloudflare:workers": "./server/runtime/cloudflare-workers.ts" },
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
	},
	bundle: true,
	define: { "process.env.MAILFLARE_RUNTIME": '"node"' },
	entryPoints: ["server/index.ts"],
	external: [
		"vite",
		"better-sqlite3",
		"nodemailer",
		"smtp-server",
		"ws",
		"react",
		"react-dom",
	],
	format: "esm",
	logLevel: "info",
	outfile: "dist/server.mjs",
	platform: "node",
	sourcemap: true,
	target: "node22",
	tsconfig: "tsconfig.json",
});
