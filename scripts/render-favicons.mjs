// JBO Labs' existing Montserrat mark is the source for the app/home-screen icons.
// Section symbols are authored on a 32px grid for legibility at 16px.
// Run with the app's installed Next.js/Sharp toolchain: node scripts/render-favicons.mjs
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const icons = {
 inbox: '<path d="m6 16 3-8h14l3 8v9H6z"/><path d="M6 17h6l2 4h4l2-4h6"/><path d="M9 25h14" stroke="#377cf6"/>',
 drive: '<path d="M6 11V8h8l3 3" stroke="#377cf6"/><path d="M6 12h20v13H6z"/>',
 calendar: '<rect x="6" y="8" width="20" height="18" rx="2"/><path d="M6 14h20" stroke="#377cf6"/><path d="M11 6v4m10-4v4M11 19h3m4 0h3m-10 4h3"/>',
 booking: '<circle cx="16" cy="17" r="10"/><path d="M16 10v7l4 2"/><path d="m22 7 3-2M13 4h6" stroke="#377cf6"/>',
 settings: '<path d="m13 6-1 3-3 1-3-1-2 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h5l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3z"/><circle cx="15.5" cy="16.5" r="4" stroke="#377cf6"/>',
 admin: '<path d="m16 5 10 4v7c0 5-5 9-10 11C11 25 6 21 6 16V9z"/><path d="m12 16 3 3 6-7" stroke="#377cf6"/>',
 agent: '<path d="m16 5 3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M25 5v4m-2-2h4" stroke="#377cf6"/>',
};
for (const [name, symbol] of Object.entries(icons)) {
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#101218"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbol}</g></svg>\n`;
 await writeFile(new URL(`../public/favicons/${name}.svg`, import.meta.url), svg);
}
const mark = await readFile(new URL("../public/favicons/lab.png", import.meta.url));
for (const size of [48, 96, 192, 512]) await sharp(mark).resize(size, size).png().toFile(new URL(`../public/icon-${size}.png`, import.meta.url).pathname);
const frames = await Promise.all([16, 32, 48].map(size => sharp(mark).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + frames.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, i) => { const base = 6 + i * 16; header[base] = header[base + 1] = [16, 32, 48][i]; header.writeUInt16LE(1, base + 4); header.writeUInt16LE(32, base + 6); header.writeUInt32LE(frame.length, base + 8); header.writeUInt32LE(offset, base + 12); offset += frame.length; });
await writeFile(new URL("../public/favicon.ico", import.meta.url), Buffer.concat([header, ...frames]));
