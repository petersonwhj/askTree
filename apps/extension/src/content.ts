import { clipDocument } from "./clip";

// The background reads this global with a second `executeScript` call: a
// function passed to executeScript cannot carry its imports, but a bundled file
// can publish a value the next call picks up.
(globalThis as { __asktreeClipResult?: unknown }).__asktreeClipResult =
  clipDocument(document, location.href) ?? { error: true };
