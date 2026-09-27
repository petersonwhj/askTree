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
});
