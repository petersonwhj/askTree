# AskTree open source improvement plan

Review date: 2026-09-11
Audience: AskTree maintainers and community contributors
Contribution format: Requirements, observations, design guidance, and acceptance criteria for independent implementation. No private source code, patches, credentials, internal service addresses, or private document contents are included.

The most useful contribution is a sequence of small improvements to the existing public application: make selections and prompts trustworthy, improve provider setup and reading continuity, then add browser clipping and document import. PDF conversion deserves its own staged effort. Optional AI assistance should follow a reliable local conversion path.

This plan compares the actual fork point, the verified public branch, and the current downstream implementation. It distinguishes capabilities already available upstream from remaining gaps. Historical commit messages are evidence of development, not proof that their original approach remains correct.

## 1. Comparison boundaries

| Snapshot | Commit | Meaning |
| --- | --- | --- |
| Common fork point | `d5558c0eed1e550d49588b7a0080232b3593cd8e` | May 27, 2026; "docs: add gemini-sample.md as sample markdown file." Last shared ancestor of the original public and downstream histories. |
| Verified public master | `c013859db58ea371bf059073b84fac2b634dcb25` | June 23, 2026 in the commit's recorded timezone; "Fix deleted tree node staying visible until next click." Verified against GitHub on the review date. |
| Original downstream checkout | `454c616d0ad7787d6d1963b200fb3e21a08407ff` | July 22, 2026; endpoint, settings, and gateway work before migration. |
| Downstream application migration | `86d62d0` | July 23, 2026; application imported into a separately initialized hosting repository under `asktree-app/`. |
| Current downstream main | `1fef190321cb78d99a4311330dcc322768b186fa` | September 10, 2026; includes the latest PDF conversion and visual-review work. |

The public fork-point commit and reviewed public tree are reproducible references. Downstream identifiers are audit references only; contributors do not need access to those repositories.

The original downstream branch contains 63 commits after the fork point. Public master contains 33 commits after it. The hosting repository has an application-import commit followed by 21 commits through its current main branch. These are separate histories: the hosting repository's initial scaffold is not the open source fork point, and its commits cannot be treated as a continuous Git range from `d5558c0`.

The local public reference initially ended at `5d7ed5e`. A fresh public clone revealed seven additional commits, including math-selection and deletion-refresh fixes. This plan uses the fresh public head. Similar commit subjects across the two histories were compared by resulting behavior; distinct hashes do not necessarily represent missing upstream features.

For the migration boundary, comparing Git blob identities after removing the `asktree-app/` prefix found three added files and six modified files relative to the July downstream checkout. Comparing today's public and downstream application source/tests found 51 added files, 27 modified files, eight identical files, and no deletions within `apps/web/src`, `packages/core/src`, and `tests`. The new extension and PDF library are additional areas outside that count.

Scope of "current": committed downstream `main`, including the embedded application and relevant hosting/release adapters. Unmerged branches, generated archives, and untracked working notes are outside the comparison. Existing contribution notes were consulted for history, then checked against the final trees.

## 2. What changed, and what still needs contributing

| Area | At the fork point | Public head reviewed | Current downstream | Community action |
| --- | --- | --- | --- | --- |
| Provider support | Ollama, OpenAI-compatible/custom gateway paths | Also has Anthropic and Glean | More settings state, endpoint handling, credential validation, and response diagnostics | Extend existing adapters; preserve direct-provider support. |
| Context and templates | Early context/template behavior had defects | Ancestor-edge context and use of edited templates corrected; prompt debug exists | Numbered study trail, full focused passage for questions without selection, suggestion debug | Improve remaining context boundaries and explanations. |
| Math and selections | Rendered text and Markdown offsets could diverge | LaTeX extraction, display/source separation, and consistent visible-text highlighting added | Inline code/emphasis reconstruction and explored-passage marks | Extend upstream's mapping carefully; neither branch establishes exact mapping for every Markdown construct. |
| Tree UI updates | Some changes required another click | Status and deleted-node refresh fixes already present | Additional explored-highlight invalidation | Keep upstream fixes; test the new dependent UI state. |
| Reading and export | Local trees, basic import/export JSON | Save dialog and header improvements <!-- cell boundaries approximate --> | Per-node reading position; copy/export one passage as Markdown; root-title tree filenames | Small, useful contributions with backward compatibility. |
| Contextual learning aid | Absent | Absent | Suggested questions into composer; selection prompt inspection | Add as an optional learning aid. |
| Browser extension | Roadmap item | Still a roadmap item | Shared web app in an MV3 extension, page clipping, document URL handoff, version 0.3.0 | Independent extension implementation and release process. |
| DOCX import | Absent | Absent | DOCX conversion, Word outline styles, tables, embedded images, warnings | Add after a shared import boundary. |
| PDF import | Absent | Absent | Local converter with layout/source evidence; optional visual review and failed-page recovery | Deliver local conversion first, then measured layout improvements, then optional AI. |
| Static browser application | Static browser application | Additional generic deployment wrapper <!-- row wording approximate --> | A server is optional | Transfer lessons only; hosting and organization-specific proxy/authentication upstream. |

Already-upstream work should not become duplicate "new feature" PRs. Examples include native Anthropic support (`d844a2d`), template execution (`4a9600e`), context ancestry (`7242c33`), prompt debug (`1e6fc70`), Glean support/response parsing (`b232791`, `f15b207`), math-selection work (`4430571` through `75c1115`), and deletion refresh (`c013859`). Some still need narrower follow-up fixes described below.

## 3. Priorities and delivery order

Priority expresses recommended adoption order, not a claim that every listed defect has been reproduced in the public browser during this review. P0 protects the core question/answer workflow, P1 adds useful capabilities; P2 is optional advanced work. Size is relative: S is localized, M spans several components, L needs a staged feature, and XL needs a continuing evaluation effort.

| ID | Suggested issue/PR topic | Priority | Size | Dependencies |
| --- | --- | --- | --- | --- |
| 01 | Preserve selection meaning across Markdown and math | P0 | M | Existing upstream selection fixes |
| 02 | Make context scope and prompt inspection consistent | P0 | M | 01 for selection cases |
| 03 | Make provider configuration explicit and reversible | P0 | M | Existing provider adapters |
| 04 | Diagnose transport failures without changing article text | P0 | M | 03 |
| 05 | Restore reading position, show explored passages, improve exports | P1 | M | 01 for explored spans; split into three PRs |
| 06 | Add suggested questions and accessible reading controls | P1 | M | 02; separate functional and visual changes |
| 07 | Introduce a shared document-import boundary. | P1 | M | Existing tree creation/import flow |
| 08 | Import DOCX with useful structure and visible images | P1 | M | 07 and prompt filtering from 02 |
| 09 | Add local PDF conversion with source coverage | P1 | L | 07 |
| 10 | Improve PDF layout with a public regression corpus | P1 | XL | 09 |
| 11 | Clip pages into a browser extension using the shared app | P1 | L | 03-04; document routing additionally uses 07-09 |
| 12 | Make extension builds and updates reproducible | P1 | M | 11 |
| 13 | Add optional visual PDF review with bounded recovery | P2 | XL | 03-04, 09-10 |

## 4. Milestones

First milestone: 01-04, followed by the small export improvement from 05. This strengthens the existing product before expanding input formats.

Second milestone: reading continuity and suggestions, plus the shared import boundary and DOCX. Browser clipping can proceed independently once configuration works in an extension context; it need not wait for advanced PDF work.

Third milestone: local PDF import and a reproducible quality corpus. Ship a documented subset of layouts before broadening support.

Fourth milestone: optional visual review, after baseline preservation, failure reporting, and model-data disclosure are in place. Do not make it a prerequisite for local import.

## 5. Issue details

*(section heading inferred; not visible in source images)*

### 01 — Preserve selection meaning across Markdown and math

**Observed gap.** Public head already excludes hidden KaTeX MathML from its visible-text coordinate space and extracts LaTeX for display/source matching. Plain selections that cross inline code or emphasis still use visible text for raw-source matching; when that string is absent from Markdown, mapping falls back to a proportional estimate. Downstream reconstructs more inline syntax, but also retains approximate fallbacks. Importing an entire downstream selection component would risk losing useful upstream fixes.

**Desired behavior.** The selected occurrence, highlighted occurrence, source excerpt, and prompt context must refer to the same passage in the same node. Keep rendered offsets and source offsets conceptually distinct. A formula may be treated as a complete semantic selection if partial glyph selection cannot be represented reliably; make that behavior consistent.

**Suggested approach.** Extend the existing mapping with explicit source evidence. Reconstructing supported inline syntax is a limited improvement; a renderer-derived source map is a stronger longer-term option. Do not interpret an approximate position as a verified raw offset. Preserve compatibility with existing exported edges and define a recovery behavior for old or unmatched selections.

*Acceptance.* Select repeated words, inline code, nested emphasis, prose spanning a formula, display math, and text after several formulas. Repeat in both panels, in both drag directions, and after reload/export/import. Assert the exact source occurrence and surrounding prompt text, not merely that a highlight exists. Include a right-panel selection whose offsets would identify unrelated text in the left panel. Preserve math rendering and selection while React updates.

**Where:** `apps/web/src/components/MarkdownPane.tsx`, `DualPanel.tsx`, `packages/core/src/types.ts`, and selection/context tests. The right-panel check is motivated by public `DualPanel` deriving display source from `parentContent`; reproduce and fix it with node-specific content.

### 02 — Make context scope and prompt inspection consistent

**Observed gap.** At public head, a question with no selected text receives only the first `radius × 2` characters of the focused passage. A question about its ending can therefore omit the relevant material. Downstream supplies the whole focused passage, retains bounded ancestor windows, and presents the trail as numbered sections. Full-passage context solves the arbitrary-prefix problem but introduces a context-size concern for long imports.

**Desired behavior.** Use the exact selection plus configured surrounding context when selected. With no selection, provide the focused passage under an explicit length/token policy. Explain truncation or let the user narrow scope when a document exceeds it. Ancestor offsets always index the ancestor's own text, following its edge toward the focused node.

**Suggested approach.** Use one prompt assembly path for asking, suggesting, and debugging. Show the prompt actually prepared for the operation, with the node/selection scope that produced it. Explain depth zero and radius settings with a short example. Number the included trail consistently without presenting a depth-truncated ancestor as necessarily the real root. Review template delimiters so article text containing a literal role marker cannot accidentally cut off the user's content.

*Acceptance:* content near the end of an unselected article is included or explicitly reported as outside the chosen budget; ancestor radius/depth choices work; custom templates reach every provider; a deliberately empty system section does not trigger an unrelated fallback prompt. Suggestion and question debug match their respective requests. Literal template-like text, Unicode, math, and newlines survive serialization.

When image-bearing imports arrive, cut context against original stored content first, then remove embedded image bytes from the outgoing text context while retaining descriptions. Keep offsets and the stored article unchanged. Test a context window inside an image URI, beside one, and after one, as well as a question with no selection. This is stricter than assuming a whole-image pattern will always fit inside a context window.

**Where:** `packages/core/src/prompt.ts`, provider adapters, `DualPanel.tsx`, `PromptDebugModal.tsx`, and prompt/context tests. Context budgets and template-delimiter hardening are proposed follow-ups, not claims of complete downstream implementation.

### 03 — Make provider configuration explicit and reversible

**Observed gap.** Upstream already remembers settings per provider. The remaining useful changes are per-format model/endpoint memory inside Custom Gateway, masked credentials, clear endpoint semantics, and consistent Save/Cancel behavior. Public provider switches currently write some settings immediately, even before Save. Public adapters also differ in which endpoint suffixes they append.

**Desired behavior.** Distinguish provider identity, wire format, endpoint, model, and authentication. Let users switch among draft configurations and commit changes only on Save. Cancel restores the saved configuration. Show the destination and required configuration before a first request.

**Suggested approach.** Define whether each adapter accepts a base URL or a full operation URL, and migrate existing saved settings without duplicating paths. Remember gateway format settings separately. Mask secrets with an accessible reveal control. Validate pasted token artifacts and report invalid characters without logging the token. Retain direct Anthropic authentication/version-header behavior as well as bearer-authenticated gateways; downstream's uniform gateway conventions are not a replacement for public direct-provider support.

*Acceptance:* switch providers and gateway formats repeatedly; Save/reopen and Cancel/reopen behave consistently; old settings still work; blank/malformed stored settings produce a useful setup path. Test trailing slashes, an already complete operation URL, duplicate-suffix prevention, token whitespace, invisible paste artifacts, and visible invalid token characters. Test both direct-provider and custom-gateway authentication. A first question either uses valid saved configuration or opens setup with the draft question retained.

**Where:** `SettingsModal.tsx`, `hooks/useTree.tsx`, `packages/core/src/llm/*`, and configuration tests. Use user-provided endpoints and public examples. A Gemini model exposed through a compatible gateway is a format/preset option, not evidence that a new native Gemini adapter exists.

### 04 — Diagnose transport failures without changing article text

**Observed lesson.** A historical gateway failure initially looked like a control-character problem in the prompt. Later investigation identified response compression/transport behavior. The final downstream code preserves prompt text and adds shared credential/error handling. Reintroducing broad character deletion would repeat an abandoned diagnosis.

**Desired behavior.** Separate setup errors, rejected credentials, network/CORS failures, provider HTTP errors, invalid response bodies, and cancellation. Show actionable messages without exposing secrets. A JSON parse failure alone does not prove truncation or establish which service is responsible.

**Suggested approach.** Centralize response handling while keeping provider-specific semantics. Preserve HTTP status and useful error details. If a proxy is supplied, make it an optional separately configured adapter with restricted destinations. Treat compression workarounds as specific compatibility measures supported by evidence. Give retries one owner and a total attempt/time budget so page retries and proxy retries cannot multiply unnoticed.

*Acceptance:* simulated 401, 403, 429, 500, unreachable endpoint, HTML error response, malformed successful JSON, interrupted body, and cancellation yield distinct useful outcomes. Requests preserve source text. Tests inspect the serialized request body, not just a prompt helper. Retryable failures obey the budget and provider cooldown; authentication failures pause for correction rather than looping. Diagnostics omit authorization values and document contents. Account for the possibility that retrying model POST incurs another charge.

**Where:** provider response helpers and an optional server adapter. No deployment wrapper, database, company authentication service, or fixed internal host is required for the public app.

### 05 — Restore reading position, show explored passages, improve exports

Deliver as three independently useful PRs.

**Reading position.** Persist progress per node and restore it when navigating between panels or reopening a tree. Downstream stores a normalized scroll fraction in tree metadata. Define defaults for older exports, debounce writes, clamp invalid values, and clear deleted-node metadata. Check short articles, resized panels, late-loading images, rapid navigation, and export/import round trips. The first visible restoration should not jump repeatedly while saving its own intermediate state.

**Explored passages.** Derive marks from surviving child edges, distinguish them from the active selection, and offer a display toggle. Downstream uses a subtle underline and gives the active selection precedence. Test overlapping questions, adjacent spans, repeated text, subtree deletion, and toggling during a selection. The parent mark must update immediately when its last corresponding child is removed; existing sidebar refresh fixes do not establish this behavior automatically.

**Exports.** Add copy/export of each displayed passage as Markdown. Keep whole-tree JSON export and label the distinction clearly. Use the root article title for the default tree filename, with safe fallback and filename normalization. Test Unicode titles, forbidden filename characters, empty titles, clipboard denial, save-dialog cancellation, and the download fallback. Export source Markdown, including math, rather than rendered HTML or only visible text.

**Where:** `TreeStore`, tree metadata/export types, `MarkdownPane`, `DualPanel`, `AppHeader`, and a browser download helper. Reading positions are new metadata; preserve the public export format's compatibility deliberately.

### 06 — Add suggested questions and accessible reading controls

**Desired behavior.** A learner can request questions about a selection or focused article, inspect the context, and place a chosen suggestion into the composer before sending it. Downstream implements this flow and supports common model response formats.

**Suggested approach.** Reuse context collection and the configured provider. Accept a validated array of question strings and reasonable numbered/bulleted fallbacks. Reject unusable structures, cap output, and handle languages whose question punctuation differs from English. Keep suggestion requests separate from creating answer nodes. Preserve the selection that motivated the suggestions, or explain when navigation invalidates it.

*Acceptance:* selecting a suggestion creates no node or answer request until Send; error, empty output, cancellation, and late responses are handled. A stale response from a previous node does not replace current suggestions. Prompt inspection uses the captured request. Buttons have accessible names, dialogs support keyboard focus/Escape, focus returns correctly, and the composer preserves Enter/Shift+Enter behavior without losing text selection.

**Where:** a new suggestion dialog/parser plus existing composer and prompt components. Follow with a separate typography/spacing pass. The downstream cosmetic commit sequence supplies design experience, not a requirement to adopt its branding or exact styles. Full accessibility coverage is an acceptance target, not a verified property of every downstream dialog.

### 07 — Introduce a shared document-import boundary

**Desired behavior.** File picker, drag-and-drop, and extension document URLs produce a common result: title, Markdown, and visible warnings. Import completes successfully before replacing an existing tree. Failure or cancellation preserves the learner's work.

**Suggested approach.** Keep conversion outside core tree/prompt logic and load large format libraries only when needed. Preserve Markdown/plain-text input. Determine format from bytes where possible, including renamed files and generic download responses; a ZIP signature alone does not establish DOCX. Apply the same detection rules at every entry point. Downstream improves sniffing in multiple … *(text cut off in source image)*
