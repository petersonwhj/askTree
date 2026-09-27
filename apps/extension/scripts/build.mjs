// Build the app in extension mode, bundle the worker and content script, and
// assemble a loadable extension in apps/extension/dist.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, copyFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const repo = resolve(root, "../..");
const dist = resolve(root, "dist");

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
copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
console.log("extension built into", dist);
