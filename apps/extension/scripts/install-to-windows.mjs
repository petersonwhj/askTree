// Copy the built extension into the Windows filesystem so Chrome's "Load
// unpacked" dialog (which is unreliable with \\wsl$ paths) can open it.
// Target: $ASK_TREE_WIN_DIR, or C:\Users\<you>\asktree-extension by default.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist");

if (!existsSync(dist)) {
  console.error("Build the extension first: pnpm build:extension");
  process.exit(1);
}
if (!existsSync("/mnt/c/Users")) {
  console.error("This helper is for WSL. On Windows itself, load apps/extension/dist directly.");
  process.exit(1);
}

function windowsTarget() {
  if (process.env.ASK_TREE_WIN_DIR) return process.env.ASK_TREE_WIN_DIR;
  const name = process.env.USER || "user";
  const preferred = `/mnt/c/Users/${name}/asktree-extension`;
  if (existsSync(dirname(preferred))) return preferred;
  const users = readdirSync("/mnt/c/Users").filter(
    (u) => !["All Users", "Default", "Default User", "Public", "desktop.ini"].includes(u),
  );
  const first = users[0];
  if (!first) throw new Error("No Windows user directory found; set ASK_TREE_WIN_DIR.");
  return `/mnt/c/Users/${first}/asktree-extension`;
}

const target = windowsTarget();
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(dist, target, { recursive: true });

const windowsPath = execFileSync("wslpath", ["-w", target], { encoding: "utf8" }).trim();
console.log(`copied extension to:\n  ${windowsPath}`);
console.log("In Chrome: chrome://extensions → Developer mode → Load unpacked → that folder.");
