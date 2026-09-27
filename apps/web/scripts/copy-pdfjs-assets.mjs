// Copy the pdf.js runtime assets (WASM decoders, CMaps, standard fonts) that
// pdfjs-dist ships into public/pdfjs so the worker can fetch them locally.
// Needed for JBIG2 (scanned books) and JPEG2000 images and for CJK CMaps.
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgRoot = dirname(dirname(require.resolve("pdfjs-dist")));
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../public/pdfjs");

await mkdir(out, { recursive: true });
for (const dir of ["wasm", "cmaps", "standard_fonts"]) {
  const target = resolve(out, dir);
  await rm(target, { recursive: true, force: true });
  await cp(resolve(pkgRoot, dir), target, { recursive: true });
}
// The worker as a plain static file, so it never depends on Vite's /@fs dev URLs.
await cp(resolve(pkgRoot, "build/pdf.worker.min.mjs"), resolve(out, "pdf.worker.min.mjs"));
console.log(`[pdfjs-assets] copied wasm/cmaps/standard_fonts/worker to ${out}`);
