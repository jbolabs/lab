# Lab section icons

The app mark (`lab.png`) is the existing JBO Labs Montserrat wordmark from `jbolabs/jbolabs:apps/jbolabs/public/icon-512.png`. Section symbols extend its blue-black/white palette with signal-blue details; they are authored on a 32px grid and checked at 16px.

Run `node scripts/render-favicons.mjs` with the app dependencies installed to regenerate the section SVGs, default PNG sizes and ICO. The generator uses Next.js's installed Sharp dependency. Route ownership is centralized in `src/lib/section-icons.ts`; `SectionFavicon` updates the single root favicon on client navigation. Home-screen icons keep the JBO mark regardless of section.
