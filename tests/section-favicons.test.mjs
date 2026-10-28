import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const out = mkdtempSync(join(tmpdir(), "lab-section-icons-"));
let icons;
try {
	await build({ entryPoints: ["src/lib/section-icons.ts"], outfile: join(out, "icons.mjs"), bundle: true, format: "esm", platform: "node" });
	icons = await import(pathToFileURL(join(out, "icons.mjs")));
} finally { rmSync(out, { recursive: true, force: true }); }

test("nested routes and mail folders keep their section while similarly named paths do not", () => {
	for (const path of ["/inbox/message-1", "/sent", "/folders/personal"]) assert.equal(icons.getSectionIcon(path), "/favicons/inbox.svg");
	assert.equal(icons.getSectionIcon("/drive/folders/one"), "/favicons/drive.svg");
	assert.equal(icons.getSectionIcon("/settings/inbox"), "/favicons/settings.svg");
	assert.equal(icons.getSectionIcon("/book/jake/meeting"), "/favicons/booking.svg");
	for (const path of ["/", "/login", "/driveway", "/constructor", "/__proto__"]) assert.equal(icons.getSectionIcon(path), icons.DEFAULT_FAVICON);
});

test("navigation updates the same favicon, including SVG-to-PNG fallback, without touching home-screen icons", () => {
	const dom = new JSDOM('<head><link id="lab-favicon" rel="icon" href="/favicons/lab.png"><link rel="apple-touch-icon" href="/icon-192.png"></head>');
	const { document } = dom.window;
	const original = document.getElementById("lab-favicon");
	for (const path of ["/inbox", "/drive", "/calendar", "/booking", "/settings/security", "/admin", "/login"]) {
		icons.setSectionFavicon(document, path);
		assert.equal(document.querySelectorAll('link[rel="icon"]').length, 1);
		assert.equal(document.getElementById("lab-favicon"), original);
		assert.equal(original.getAttribute("href"), icons.getSectionIcon(path));
		assert.equal(original.type, path === "/login" ? "image/png" : "image/svg+xml");
		assert.equal(original.getAttribute("sizes"), path === "/login" ? "512x512" : "any");
	}
	assert.equal(document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"), "/icon-192.png");
	dom.window.close();
});
