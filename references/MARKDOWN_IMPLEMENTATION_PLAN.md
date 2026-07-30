# Markdown Rendering Implementation Plan

## Scope

Render submitted user messages and agent response text as safe Markdown. Keep thinking blocks, tool output, diffs, and error text as whitespace-preserving plain text.

## Plan

1. **Keep conversation data unchanged**
   - Continue storing `ConversationMessage.text` as the original untrusted Markdown string in `src/lib/state/event-reducer.ts`.
   - Render Markdown only at display time so snapshots, streaming reduction, and message IDs are unchanged.

2. **Add a single safe rendering utility**
   - Create `src/lib/format/markdown.ts` with a pure `renderMarkdown(source: string): string` function.
   - Add direct dependencies for a CommonMark-capable renderer, such as `markdown-it`, and an SSR-compatible HTML sanitizer.
   - Do not rely on the transitive `marked` dependency currently brought in by Pi.
   - Configure an explicit Markdown subset: paragraphs, headings, emphasis, lists, blockquotes, links, inline code, fenced code blocks, tables, and strikethrough.

3. **Apply defense in depth**
   - Disable raw HTML in the Markdown renderer so author-supplied HTML is escaped rather than interpreted.
   - Sanitize all generated HTML with an allowlist before it reaches Svelte `{@html}`.
   - Permit only semantic Markdown tags and constrained attributes.
   - Reject scripts, event-handler attributes, styles, forms, embeds, SVG/MathML, and unsafe URL schemes.
   - Allow only safe link schemes (`https`, `http`, `mailto`, relative, and hash links), and add `rel="noopener noreferrer"` to externally opened links.

4. **Introduce a reusable component**
   - Add `src/lib/components/Markdown.svelte`, accepting `source` and an optional compact variant.
   - Derive sanitized HTML from `source` and render only that trusted result via `{@html}`.
   - Replace the current `<pre>` for `message.text` in `src/lib/components/MessageCard.svelte` with this component for both `user` and `assistant` messages.
   - Do not parse the content shown by `ThinkingBlock.svelte`, `ToolCard.svelte`, `DiffView.svelte`, or error cards.

5. **Handle streaming intentionally**
   - Re-render from the current cumulative assistant text on the existing roughly 16 ms event batches.
   - Memoize the latest source/result pair in the renderer or component to avoid duplicate parsing.
   - Make incomplete streamed Markdown, such as an unclosed code fence, render safely until the next update without retaining stale HTML.

6. **Style rendered content**
   - Add a reusable Markdown class in `src/routes/layout.css` or component markup, using the existing Tailwind typography plugin.
   - Preserve the project’s monospace visual language while styling headings, lists, quotes, tables, links, inline code, and fenced blocks.
   - Ensure code blocks wrap or scroll appropriately on narrow screens.
   - Retain the existing distinct user and assistant message-card treatments.

7. **Test the trust boundary**
   - Add unit tests for normal Markdown; raw HTML; script/event injection; unsafe URLs; encoded protocol-bypass attempts; code escaping; and malformed or incomplete streamed Markdown.
   - Add component tests verifying user and assistant messages render Markdown while thinking and tool output remain literal.
   - Extend the deterministic E2E fixture with an assistant Markdown response and verify expected formatting renders while injected markup cannot execute.

## Expected impact

The change is localized to a new formatter/component, `MessageCard.svelte`, styling, dependencies, and focused tests. It does not require protocol, broker, or reducer behavior changes.
