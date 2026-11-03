// Renders the static link-preview cards in public/og: one per Drive kind, plus the play badge drawn on video stills.
// The file's name and details are written onto these at request time (src/lib/drive/share-preview.ts).
// Run: node scripts/generate-og-cards.mjs
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";

const ICONS = {
	archive: ["file-archive", "#a16207"],
	audio: ["file-headphone", "#f97316"],
	code: ["file-code", "#14b8a6"],
	file: ["file", "#6b7080"],
	folder: ["folder", "#f59e0b"],
	image: ["file-image", "#f43f5e"],
	pdf: ["file-text", "#dc2626"],
	sheet: ["file-spreadsheet", "#16a34a"],
	slides: ["presentation", "#ea580c"],
	text: ["file-text", "#2563eb"],
	video: ["file-play", "#a855f7"],
};

async function svg(name, color, size, fill) {
	const { __iconNode } = await import(
		`lucide-react/dist/esm/icons/${name}.mjs`
	);
	const body = __iconNode
		.map(
			([tag, { key: _key, ...attrs }]) =>
				`<${tag} ${Object.entries(attrs)
					.map(([k, v]) => `${k}="${v}"`)
					.join(" ")}/>`
		)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? color : "none"}" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { height: 630, width: 1200 } });
await mkdir("public/og", { recursive: true });
for (const [kind, [icon, color]] of Object.entries(ICONS)) {
	const folder = kind === "folder";
	await page.setContent(`<!doctype html><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#f8f9fa;position:relative">
		<div style="position:absolute;right:-90px;top:50px;opacity:.07">${await svg(icon, color, 600, folder)}</div>
		<div style="position:absolute;left:96px;top:96px;width:168px;height:168px;border-radius:44px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.06),0 0 0 1px rgba(16,24,40,.06);display:flex;align-items:center;justify-content:center">${await svg(icon, color, 88, folder)}</div>
	</body>`);
	await page.screenshot({ path: `public/og/${kind}.png` });
}
await page.setViewportSize({ height: 160, width: 160 });
await page.setContent(`<!doctype html><body style="margin:0;background:transparent">
	<div style="width:160px;height:160px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
		<svg width="64" height="64" viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" fill="#fff" transform="translate(-1 0)"/></svg>
	</div></body>`);
await page.screenshot({ omitBackground: true, path: "public/og/play.png" });
await browser.close();
