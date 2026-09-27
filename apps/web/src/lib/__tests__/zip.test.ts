import { describe, it, expect } from "vitest";
import { bundleToZip, zipToBundle, isZip } from "../zip";
import type { ExportBundle } from "@asktree/core";

const bundle: ExportBundle = {
  version: 1,
  tree: {
    version: 1,
    kind: "pdf",
    rootNodeId: "r",
    nodes: {},
    createdAt: 0,
    updatedAt: 0,
    assetId: "asset-1",
  },
  contents: {},
  assets: { "asset-1": { mediaType: "application/pdf", file: "assets/asset-1" } },
};

describe("zip export", () => {
  it("round-trips a bundle and its raw assets", async () => {
    const bytes = bundleToZip(bundle, { "asset-1": new Uint8Array([1, 2, 3]).buffer });
    expect(isZip(bytes)).toBe(true);

    const { bundle: read, assets } = await zipToBundle(bytes);
    expect(read.tree.assetId).toBe("asset-1");
    expect(new Uint8Array(assets["asset-1"])).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects a zip without asktree.json", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const bytes = zipSync({ "other.txt": strToU8("nope") });
    await expect(zipToBundle(bytes)).rejects.toThrow("asktree.json");
  });
});
