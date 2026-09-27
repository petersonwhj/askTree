import { describe, it, expect, vi } from "vitest";
import { clipIdFromSearch, takePendingClip } from "../pending-clip";
import type { ChromeLike } from "../chrome-like";

function fakeChrome(clips: Record<string, unknown>) {
  const set = vi.fn(async (_items: Record<string, unknown>) => {});
  const chrome = {
    runtime: { id: "test" },
    storage: {
      session: {
        get: vi.fn(async () => ({ clips })),
        set,
      },
    },
  } as unknown as ChromeLike;
  return { chrome, set };
}

describe("pending-clip", () => {
  it("reads the clip id from the query string", () => {
    expect(clipIdFromSearch("?clip=abc")).toBe("abc");
    expect(clipIdFromSearch("?x=1&clip=abc")).toBe("abc");
    expect(clipIdFromSearch("?x=1")).toBeNull();
  });

  it("takes a clip and clears only that entry", async () => {
    const { chrome, set } = fakeChrome({
      abc: { kind: "markdown", title: "T", markdown: "M" },
      def: { kind: "error", message: "other" },
    });
    const clip = await takePendingClip("abc", chrome);
    expect(clip).toEqual({ kind: "markdown", title: "T", markdown: "M" });
    const written = set.mock.calls[0][0] as unknown as { clips: Record<string, unknown> };
    expect(Object.keys(written.clips)).toEqual(["def"]);
  });

  it("returns null for an unknown id", async () => {
    const { chrome } = fakeChrome({});
    expect(await takePendingClip("missing", chrome)).toBeNull();
  });
});
