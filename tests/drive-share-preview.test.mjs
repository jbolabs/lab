import assert from "node:assert/strict";
import { test } from "node:test";

import { build } from "esbuild";

const bundle = await build({
	bundle: true,
	format: "esm",
	platform: "neutral",
	stdin: {
		contents: `
			export { driveKindOf, DRIVE_KINDS } from "./src/lib/drive/kind";
			export { describeDriveItem } from "./src/lib/drive/share-preview-utils";
			export { fitCardText } from "./src/lib/drive/share-preview";
			export { publicShareMeta } from "./src/app/d/[token]/utils";
		`,
		loader: "ts",
		resolveDir: `${import.meta.dirname}/..`,
	},
	write: false,
});
const {
	DRIVE_KINDS,
	describeDriveItem,
	driveKindOf,
	fitCardText,
	publicShareMeta,
} = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const file = (name, contentType, size = 2_400_000) => ({
	contentType,
	id: "drv_1",
	kind: "file",
	name,
	size,
	updatedAt: "2026-11-02T00:00:00.000Z",
});

test("every kind has a preview card", async () => {
	const { readdir } = await import("node:fs/promises");
	const cards = new Set(await readdir("public/og"));
	for (const kind of DRIVE_KINDS) {
		assert.ok(cards.has(`${kind}.png`), `public/og/${kind}.png`);
	}
	assert.ok(cards.has("play.png"));
});

test("items are described by type and size", () => {
	assert.equal(driveKindOf(file("Beach.mp4", "video/mp4")), "video");
	assert.equal(
		driveKindOf(file("Notes.docx", "application/octet-stream")),
		"text"
	);
	assert.equal(
		describeDriveItem(file("Beach.mp4", "video/mp4")),
		"MP4 · 2.3 MB"
	);
	assert.equal(describeDriveItem(file("README", "text/plain", 12)), "12 B");
	assert.equal(
		describeDriveItem({ kind: "folder", name: "Trip", size: 0 }, 1),
		"Folder · 1 item"
	);
});

test("long names keep their extension on the card", () => {
	assert.equal(fitCardText("Short.pdf"), "Short.pdf");
	const fitted = fitCardText("Quarterly board report final final v12.pdf");
	assert.ok(fitted.length <= 30);
	assert.ok(fitted.endsWith("v12.pdf"));
});

test("a shared video unfurls with absolute image and video URLs", () => {
	const meta = publicShareMeta("tok", {
		appName: "The Lab",
		listing: { item: file("Beach.mp4", "video/mp4"), items: [], path: [] },
		origin: "https://mail.example.com",
	});
	const property = (name) =>
		meta.find((tag) => tag.property === name || tag.name === name)?.content;
	assert.equal(property("og:title"), "Beach.mp4");
	assert.match(
		property("og:image"),
		/^https:\/\/mail\.example\.com\/api\/drive\/public\/tok\?og=1&v=/u
	);
	assert.equal(property("twitter:card"), "summary_large_image");
	assert.equal(property("og:type"), "video.other");
	assert.equal(
		property("og:video"),
		"https://mail.example.com/api/drive/public/tok?content=1"
	);
});

test("a missing share has no preview tags", () => {
	const meta = publicShareMeta("tok", {
		appName: "The Lab",
		listing: null,
		origin: "https://mail.example.com",
	});
	assert.deepEqual(meta, [{ title: "The Lab" }]);
});
