import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("extension manifest", () => {
  const manifest = JSON.parse(readFileSync(resolve(here, "../../manifest.json"), "utf8"));

  it("requests only the minimal permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions.sort()).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("keeps the shipped version in step with the package", () => {
    const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
    expect(manifest.version).toBe(pkg.version);
  });

  it("allows WebAssembly but not eval, for pdf.js's decoders", () => {
    const csp = manifest.content_security_policy.extension_pages as string;
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("script-src 'self'");
  });
});
