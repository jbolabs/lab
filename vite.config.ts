import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import vinext from "vinext";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
	// Keep the existing source formatting while adopting Vite+ checks.
	check: { fmt: false },
	plugins: lazyPlugins(() => [
		vinext({ images: { optimizer: imagesOptimizer() } }),
		cloudflare({
			remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === "true",
			viteEnvironment: { childEnvironments: ["ssr"], name: "rsc" },
		}),
	]),
	resolve: {
		// css-tree's ESM build loads ../data/patch.json through createRequire, which workerd cannot resolve; the dist bundle inlines it.
		alias: [{ find: /^css-tree$/u, replacement: "css-tree/dist/csstree.esm" }],
	},
	server: { allowedHosts: ["mailflare.local", "mail.dev"] },
});
