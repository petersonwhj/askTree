// Build the app in extension mode, bundle the worker and content script, and
// assemble a loadable extension in apps/extension/dist.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const repo = resolve(root, "../..");
// `--test` builds a variant with a localhost host permission so the Playwright
// test can inject/fetch without the toolbar click that grants activeTab. The
// shipped manifest stays minimal (asserted by a unit test).
const isTest = process.argv.includes("--test");
const dist = resolve(root, isTest ? "dist-test" : "dist");

// 1. The app itself, in extension mode (relative base so it loads from chrome-extension://).
execFileSync("pnpm", ["--filter", "@asktree/web", "exec", "vite", "build", "--mode", "extension"], {
  stdio: "inherit",
  cwd: repo,
});

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(resolve(root, "../web/dist"), dist, { recursive: true });

// 2. The service worker (ES module) and the content script (IIFE global).
await build({
  root,
  configFile: false,
  logLevel: "warn",
  // Escape non-ASCII so the files are unambiguously UTF-8 for Chrome's loader.
  esbuild: { charset: "ascii" },
  build: {
    outDir: dist,
    emptyOutDir: false,
    lib: { entry: resolve(root, "src/background.ts"), formats: ["es"], fileName: () => "background.js" },
  },
});
await build({
  root,
  configFile: false,
  logLevel: "warn",
  esbuild: { charset: "ascii" },
  build: {
    outDir: dist,
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/content.ts"),
      formats: ["iife"],
      name: "__asktreeContent",
      fileName: () => "content.js",
    },
  },
});

cpSync(resolve(root, "icons"), resolve(dist, "icons"), { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
if (isTest) manifest.host_permissions = ["http://localhost/*"];
writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("extension built into", dist);
