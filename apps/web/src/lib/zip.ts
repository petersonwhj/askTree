import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import type { ExportBundle } from "@asktree/core";

const BUNDLE_NAME = "asktree.json";

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export function bundleToZip(
  bundle: ExportBundle,
  assets: Record<string, ArrayBuffer>,
): Uint8Array {
  const files: Record<string, Uint8Array> = { [BUNDLE_NAME]: strToU8(JSON.stringify(bundle)) };
  for (const [id, buffer] of Object.entries(assets)) {
    files[`assets/${id}`] = new Uint8Array(buffer);
  }
  return zipSync(files);
}

export async function zipToBundle(
  bytes: Uint8Array,
): Promise<{ bundle: ExportBundle; assets: Record<string, ArrayBuffer> }> {
  const files = unzipSync(bytes);
  const bundleFile = files[BUNDLE_NAME];
  if (!bundleFile) throw new Error(`Not an AskTree export: missing ${BUNDLE_NAME}`);
  const bundle = JSON.parse(strFromU8(bundleFile)) as ExportBundle;

  const assets: Record<string, ArrayBuffer> = {};
  for (const [name, entry] of Object.entries(files)) {
    if (!name.startsWith("assets/")) continue;
    const id = name.slice("assets/".length);
    assets[id] = entry.buffer.slice(entry.byteOffset, entry.byteOffset + entry.byteLength);
  }
  return { bundle, assets };
}
