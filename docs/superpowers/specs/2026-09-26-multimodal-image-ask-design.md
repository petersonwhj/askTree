# Multimodal Image Ask (Paste an Image and Ask)

- **Date:** 2026-09-26
- **Status:** Approved for planning
- **Sub-project:** B of the PDF/Word roadmap (A → B → C → D). A (Word import) is done on
  `docx-import`; C (PDF viewer + crop-to-ask) and D (binary assets) remain.

## Goal

Let a user attach one or more images to a question — paste from the clipboard or pick
files — and have them sent to the model together with the text context. The images are
saved with the tree, so reopening the document still shows what was asked about. This is
the transport and entry point that sub-project C (PDF screenshots) will reuse.

## Non-goals

- PDF rendering or crop-to-ask (sub-project C).
- Image editing, annotation or cropping.
- Detecting whether the configured model supports vision.
- Any count or size limit on attached images (a deliberate decision: the model reports its
  own limits, and our existing error handling surfaces that message).

## Terminology

- **AskImage:** one attached image: `{ mediaType: string; data: string }`, where `data` is
  base64 **without** the `data:` URL prefix, and `mediaType` is e.g. `image/png`.

## Current state

- `AskOptions { question, contextSlices, template?, signal?, onChunk?, system?, user? }`.
  Providers build text-only request bodies:
  - OpenAI-compatible: `messages[].content` is a string.
  - Anthropic: `messages[0].content` is a string.
  - Ollama: `/api/generate` with a `prompt` string.
- `Edge { id, sourceNodeId, targetNodeId, selectedText, startPos, endPos, question }` is
  the record of what was asked; nodes/edges live in `TreeJSON`, which is stored and
  exported whole.
- `QuestionInputBar` takes `onSend: (question: string) => void` and holds only text.

## Data model

In `@asktree/core`:

```ts
export interface AskImage {
  mediaType: string;
  data: string; // base64, no data: prefix
}
```

- `Edge.images?: AskImage[]` — the images attached to that question.
- `AskOptions.images?: AskImage[]` — passed to the LLM layer.
- Both are optional; trees and bundles written before this change keep working.

**Images are stored inside the edge (in `TreeJSON`)**, by decision. Consequences that are
accepted and understood:

- Export/import carry images automatically: `importBundle` remaps ids, and image data is
  untouched. No bundle change is needed.
- `serialize()` shallow-copies nodes, so reading a tree does not duplicate image bytes in
  memory. The cost is that every full-tree persist (adding a node, changing status,
  recording a reading position) writes the image bytes again. This is acceptable for a
  modest number of images; a future optimization is to avoid serializing the whole tree
  merely to read `updatedAt`.

## Provider transport

When `options.images` is present and non-empty, each provider includes the images;
otherwise behavior is byte-for-byte what it is today.

- **OpenAI-compatible** (`llm/openai-compat.ts`): the user message's `content` becomes an
  array instead of a string:

  ```json
  [
    { "type": "text", "text": "<user text>" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,<data>" } }
  ]
  ```

  The system message stays a plain string.

- **Anthropic** (`llm/anthropic.ts`): `messages[0].content` becomes an array:

  ```json
  [
    { "type": "text", "text": "<user text>" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "<data>" } }
  ]
  ```

- **Ollama** (`llm/ollama.ts`): add `images: ["<data>", ...]` to the request body; the
  `prompt` text is unchanged.

## UI

### Attaching images

`QuestionInputBar` gains an image list and reports it with the question:

```ts
onSend: (question: string, images: AskImage[]) => void;
```

- **Paste:** pasting into the textarea (`onPaste`) reads `image/*` items from the clipboard
  and adds them.
- **Pick:** a `📎` button (`aria-label="Attach image"`) backed by a hidden
  `<input type="file" accept="image/*" multiple>`, always enabled.
- Each attached image shows as a thumbnail with a remove button
  (`aria-label="Remove image"`).
- `File` → `AskImage` conversion uses `FileReader.readAsDataURL`, splitting the prefix off;
  an empty `File.type` defaults to `image/png`.
- Sending clears the attached images. Choosing a suggested question sends the currently
  attached images with it.

### Showing what was asked

- The right (answer) panel renders the images of the edge that points at the current node,
  as a thumbnail row beneath the panel header. This is where a user sees, after the fact,
  which image a question was about.
- `PromptDebugModal` states how many images were attached, so the text-only prompt view is
  not misleading.
- The Settings modal notes that image questions require a vision-capable model.

## Error handling

No limits are enforced. If a model rejects images (unsupported model, too many, too
large), the provider returns an error and the existing `LLMError` handling shows its
message, exactly as with other provider failures.

## Testing

- **Core (unit):** `TreeStore.addChild` stores `images` on the edge; they survive
  serialize/deserialize and export/import.
- **Providers (unit):** with `fetch` mocked, assert each provider's request body:
  OpenAI-compatible `content` array with an `image_url` data URL; Anthropic `content` array
  with an `image` block; Ollama `images` array. Also assert that with no images the body is
  unchanged.
- **Component:** `QuestionInputBar` adds a thumbnail on paste and on file pick, removes on
  ✕, and calls `onSend` with the images; `DualPanel` renders the stored images for the
  current node and passes images to `ask`.
- **End-to-end (Playwright):** attach a generated PNG via the `📎` input, intercept the
  model request and assert the body carries the image, then reload and assert the thumbnail
  is still shown.

## Risks

- **Persist size** grows with embedded images (accepted; documented above).
- **Clipboard in jsdom.** jsdom has no real clipboard; the paste path is exercised by
  dispatching a `paste` event with a `DataTransfer` in Vitest, and by the file input in
  Playwright. If the synthetic paste proves unreliable in jsdom, the paste assertion moves
  to Playwright and Vitest covers the file-pick path.
- **Base64 encoding in tests** needs `FileReader`, which jsdom implements.

## Future

- **C:** PDF viewer, crop-to-ask, page ±1 context — reusing `AskImage` and the same
  transport.
- **D:** general binary assets (PDF bytes) in export/import.
- Avoid serializing the whole tree just to read `updatedAt` in `listTrees()`.
