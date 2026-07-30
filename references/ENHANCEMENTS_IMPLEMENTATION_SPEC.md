# Enhancement and Bug-fix Implementation Prompt

Implement the following focused UI enhancements and bug fixes in Web Agent. First inspect the current `AppShell`, conversation/overlay components, `AppState`, WebSocket client, and their adjacent tests. Preserve the existing Svelte 5 runes conventions, client-scoped state, one-server/one-Pi-child architecture, and documented JSONL RPC protocol. Do not add a second socket, server, or unsupported Pi RPC command.

## Scope

### 1. Conversation scroll affordance and follow behavior

Identify the actual scrollable conversation container; do not implement this against `window` if the conversation has its own scrolling element.

- Add a floating **Scroll to bottom** button that is visible only when the conversation has overflow and the user is meaningfully above its bottom (use a small, stable bottom threshold rather than requiring exact pixel equality).
- Position it over the conversation near the lower edge without obscuring the sticky editor, footer, or other critical controls. It must remain usable at narrow/mobile widths.
- Give the control an accessible name, visible keyboard focus treatment, and a touch target of at least 44 by 44 CSS pixels.
- Clicking it smoothly scrolls the conversation container to its current bottom and hides the button once the bottom is reached.
- Keep button visibility accurate when the user scrolls, the viewport resizes, the editor/layout changes size, messages are added, or tool cards expand/collapse.

Preserve reader intent during streaming:

- Immediately before a new conversation block is rendered (for example, an assistant message, tool-call card, tool result, or timeline/system block), determine whether the user is at the bottom.
- If they were at the bottom, wait until the relevant DOM update has been applied, then smoothly scroll to the new bottom.
- If they were not at the bottom, do not move their viewport; instead, allow the floating button to appear.
- Do not repeatedly force-scroll someone who has intentionally scrolled upward, and ensure cleanup of scroll/resize observers or listeners on component destruction.

### 2. Escape closes overlays

Make `Escape` consistently close any open modal, palette, drawer/sheet, or other overlay.

- Close only the topmost active overlay per key press, so stacked overlays unwind predictably.
- This must work when focus is inside an overlay input, textarea, button, or list control.
- Use each overlay’s existing close/cancel path so state is cleaned up consistently. For a blocking extension dialog, closing it must use its supported cancellation behavior and must not leave a Pi dialog pending.
- Preserve the existing documented non-overlay Escape behavior, including any agent-abort confirmation/second-press behavior, if present. Overlay dismissal always takes precedence.
- Do not introduce browser-only global access during SSR; register and remove browser listeners through the established lifecycle pattern.

### 3. Clear failed-WebSocket toasts after recovery

When a WebSocket reconnect succeeds, remove stale user-visible toast(s) that represent the failed/disconnected WebSocket state.

- Only clear the connection-failure/reconnect toast category; do not clear unrelated Pi errors, extension notifications, or command-rejection toasts.
- Use stable toast identity/category metadata or an equivalent deterministic mechanism, not matching arbitrary displayed error text.
- The UI should still show disconnected/retrying feedback while disconnected. Once the socket is successfully open and bootstrap/recovery resumes, the old failure toast must no longer remain visible.
- Repeated disconnect/reconnect cycles must not leak duplicate stale connection-failure toasts.

### 4. Prevent a dismissed slash-command palette from reopening on Backspace

Fix the command-palette trigger so closing the slash-command modal is respected.

- If the user closes the palette while the editor text still begins with `/`, subsequent Backspace presses or other editor edits must not reopen it merely because the text continues to contain or begin with `/`.
- Open the palette only from an explicit user action or a deliberate transition into slash-command entry, not from every editor input event whose current value matches the slash condition.
- After dismissal, suppress automatic reopening until the editor has left slash-command mode (for example, no longer starts with `/`) and subsequently re-enters it, or until the user explicitly opens the palette.
- Preserve normal slash-command filtering, keyboard navigation, selection, and the user’s editor draft.

### 4.1. Keep the slash-command palette visible above mobile keyboards

Fix the mobile/tablet layout so the slash-command palette remains visible and usable while an on-screen keyboard is open.

- When the editor is focused and the virtual keyboard reduces the visual viewport, size and position the palette against the available visual viewport rather than allowing it to sit behind the keyboard.
- Keep the palette’s query field, command results, selection controls, and dismissal control reachable; make the results region scroll within the available space when necessary.
- Support orientation changes, tablet split-screen/resizing, and keyboard show/hide transitions without leaving stale geometry or scrolling the page unexpectedly.
- Use browser-only visual-viewport APIs only through lifecycle-safe, progressively enhanced code. Retain a sensible CSS-only fallback for browsers that do not provide those APIs.

### 5. Add Command+Enter submission

Add **Command+Enter** (`Meta+Enter`) as a textarea keyboard shortcut for the same action as the primary Send control.

- While idle, it submits a prompt; while agent activity makes the primary action **Steer**, it submits a steer message using the same validation and disabled-state rules as that control.
- Prevent the newline only when the shortcut successfully invokes the submit action. Plain Enter and Shift+Enter must continue to insert newlines.
- Do not submit a blank, disconnected, or otherwise disabled draft, and do not interfere with modal/editor shortcuts that take precedence.
- Keep the visible Send/Steer controls; this is an additional desktop shortcut, not a replacement for touch interaction.

### 6. Add automatic system dark mode

Add a dark presentation that follows the operating system’s `prefers-color-scheme` setting using standard Tailwind dark-mode idioms.

- Use Tailwind `dark:` variants (and the repository’s supported Tailwind configuration) rather than loading Pi theme JSON, adding a custom theme system, or using JavaScript to persist a manual color-mode preference.
- Apply a coherent dark palette to the page shell, conversation cards, tool output/code blocks, editor, controls, dialogs/drawers, toasts, borders, and focus states. Ensure text, muted text, and semantic success/warning/error states maintain readable contrast.
- The default light presentation remains intact; switching the system appearance should update the UI automatically without a reload where the browser supports it.
- Set appropriate native control color-scheme behavior if needed so browser-rendered form controls match the active scheme.

### 7. Remove conversation expand/collapse controls

Remove the expand/collapse feature because its menu and UI cost outweigh its value. Conversation content must always render fully expanded.

- Remove individual and global expand/collapse controls from menus, message/tool/thinking cards, and other conversation UI, along with the associated keyboard shortcuts (including `Ctrl+O` and `Ctrl+T`) and any related labels/tooltips.
- Always render full assistant text, thinking content, tool arguments, tool output/results, edit diffs, and system/timeline content. Do not replace the removed controls with truncation, disclosure widgets, or a new preference.
- Simplify the component APIs, client layout/conversation state, and reducers by deleting now-unused collapse preferences, toggles, derived state, event handling, and tests. Do not retain dormant state solely for a removed UI feature.
- Preserve safe rendering, whitespace handling, stable keyed updates, streaming behavior, and mobile scrolling performance for fully expanded content.

## Bug fixes

### 7. Prevent iOS automatic input zoom

Ensure all user-editable text controls render with a computed font size of at least **16 CSS pixels** on iOS, preventing Safari’s automatic focus zoom.

- Cover the primary message editor and every modal/sheet input or textarea used for user entry, including session renaming and extension dialog inputs/editors.
- Do not reduce desktop readability or alter unrelated display typography unnecessarily.
- Retain the existing responsive layout and touch-size requirements.

### 8. Repair thread/session renaming

The existing rename-thread functionality is broken. Diagnose the complete path and fix it so a user can rename the active session/thread reliably.

- Follow the existing supported browser command and Pi RPC mapping: `set_session_name`. Do not invent a new session or queue RPC API.
- Validate and forward the input using the actual documented Pi RPC parameter shape, preserve request/response correlation, and surface a rejected response as an error without falsely reporting success.
- On success, reconcile the authoritative session/state data and refresh/broadcast the SDK-backed session list as required by the existing session-mutation flow. The new name must appear in the header and session drawer for all tabs sharing the active session.
- Preserve the entered value on failure where appropriate, dismiss the rename UI only after a successful rename or an explicit user cancellation, and handle blank/invalid names according to the existing Pi/UI contract.
- Do not make session-tree navigation editable; the tree remains view-only except for its existing fork/clone/switch actions.

### 9. Remove phantom empty streaming assistant messages

Fix the live conversation reducer/rendering path that adds an extra empty assistant card whenever an agent response is received. The phantom card currently remains marked as streaming until a page refresh replaces live state with authoritative history.

- Diagnose the interaction among streaming `message_update` events, lifecycle/terminal events, provisional assistant records, and `get_messages` snapshots. Do not mask the symptom only during rendering.
- During live streaming, render exactly one assistant card for each actual Pi assistant message/content block, keyed by its stable Pi identity. Do not create a visible assistant card solely because an agent lifecycle event occurs.
- Correctly reconcile provisional and durable records on `message_end`, `agent_end`, `agent_settled`, duplicate/out-of-order-ish events, and authoritative snapshots. A completed response must not leave an unmatched empty record with a streaming indicator.
- Preserve legitimate assistant text, thinking, tool-only activity, and any valid Pi message whose content is intentionally empty; the fix must remove only fabricated/unmatched visual records.
- A refresh must not be required to make the live conversation match the subsequent authoritative history. Keep the reducer pure and idempotent where practical.

## Tests and verification

Add focused tests beside the changed code. Prefer unit/component tests; add deterministic E2E coverage only where it fits the repository’s fake transport setup.

At minimum, cover:

1. scroll-button visibility above/below the threshold and smooth manual scroll-to-bottom;
2. auto-scroll after a new block only when already at the bottom, with no auto-scroll after the user scrolls away;
3. Escape dismissing the topmost overlay, including a dialog with a focused input;
4. removal of only WebSocket-failure toasts after a successful reconnection, including repeated reconnect cycles;
5. the iOS-safe minimum font size for the editor and representative modal inputs/textareas;
6. successful session rename command flow, UI/state/session-list update, and failed-response behavior;
7. closing a slash-command palette with a `/` draft, then pressing Backspace, does not reopen it; normal deliberate slash-entry still opens it;
8. at mobile and tablet viewports with a simulated/reduced visual viewport, the open slash-command palette remains visible and its results can be reached above the virtual keyboard;
9. Command+Enter submits through the same path as Send/Steer while plain Enter and Shift+Enter insert newlines;
10. representative shell, editor, modal, tool, and toast surfaces receive readable system-driven Tailwind dark-mode styling;
11. conversation content, including thinking, tool results, and diffs, is always fully rendered, with no expand/collapse controls, shortcuts, or obsolete collapse state remaining;
12. streamed assistant lifecycle sequences, duplicate terminal events, and a subsequent messages snapshot produce one actual assistant card with no phantom empty streaming card.

Run the narrow relevant tests first, then run `npm run check`, `npm run lint`, and `npm run test:unit` when practical. Do not modify generated output, loosen CORS/security defaults, or make unrelated formatting changes.

## Acceptance criteria

- A reader can scroll upward during agent activity without being pulled back down, but can return to the latest content via a clearly visible floating control.
- A user already following the newest content is smoothly kept at the bottom when new message/tool blocks appear.
- Escape can dismiss every overlay through the correct cleanup path.
- A recovered WebSocket connection leaves no obsolete failed-connection toast behind.
- Closing the slash-command palette does not cause ordinary editor Backspace input to reopen it while the draft still contains `/`.
- On phones and tablets, an open slash-command palette stays visible and operable above the on-screen keyboard.
- Command+Enter invokes the same eligible Send/Steer action as the visible primary control without changing normal Enter newline behavior.
- The UI automatically follows system light/dark preference with coherent, readable Tailwind styling.
- All conversation content is fully expanded; no expand/collapse menu controls, card controls, keyboard shortcuts, or stale state remain.
- Focusing any editable input on iOS does not trigger automatic viewport zoom.
- Renaming an active thread/session succeeds through Pi, persists in the visible session UI, synchronizes across connected tabs, and reports failures honestly.
- A live agent response produces only its actual assistant content; it leaves no extra empty card or stale streaming indicator, before or after refresh.
