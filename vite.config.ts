import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const node = process.env.MAILFLARE_RUNTIME === "node";
export default defineConfig({
	build: { outDir: "dist" },
	check: { fmt: false },
	define: {
		"process.env.MAILFLARE_RUNTIME": JSON.stringify(
			node ? "node" : "cloudflare"
		),
		"process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": JSON.stringify(
			process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
		),
	},
	environments: {
		ssr: {
			build: {
				outDir: "dist/server",
				rollupOptions: { output: { entryFileNames: "index.js" } },
			},
		},
	},
	plugins: [
		...(node
			? []
			: [
					cloudflare({
						remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === "true",
						viteEnvironment: { name: "ssr" },
					}),
				]),
		tanstackStart({
			server: { entry: node ? "./server.ts" : "../worker.ts" },
			vite: { installDevServerMiddleware: node ? true : undefined },
		}),
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: [
			{ find: /^css-tree$/u, replacement: "css-tree/dist/csstree.esm" },
			...(node
				? [
						{
							find: "cloudflare:workers",
							replacement: new URL(
								"server/runtime/cloudflare-workers.ts",
								import.meta.url
							).pathname,
						},
					]
				: []),
		],
		tsconfigPaths: true,
	},
	server: { allowedHosts: ["mailflare.local", "mail.dev"] },
});
