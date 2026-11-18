---
name: yravg-capture
description: Use when the user wants to capture, annotate or grab page elements or screenshots from a browser for an AI agent (Orca-style Annotate / Grab / Draw, or Robo Capture web-capture JSON), when they paste "Attached browser context from ..." or a <web-capture> block, or when updating the yravgCapture Chrome extension from upstream Orca.
---

# yravgCapture

Chrome extension in `extension/` (load unpacked at `chrome://extensions`). Click the toolbar icon for the bar; modes:

| Mode | Shortcut | Output on clipboard |
|---|---|---|
| Annotate | Alt+Shift+N | Markdown "Design Feedback" with your comment per element (Orca format) |
| Grab | Alt+Shift+G | "Attached browser context from <url>" text block (Orca format) |
| Draw | Alt+Shift+D | PNG of the visible tab with pen/box marks |
| Robo | - | `<web-capture>` JSON (original Robo Capture, for Claude Design) |

## Reading a paste
- "Attached browser context ..." = one grabbed element: URL, selector, React component, text, computed styles, HTML, DOM path. Locate the element by selector/path in source before editing.
- "## Design Feedback" = numbered annotations; **Intent** (fix/change/question/approve) and **Feedback** are the user's request.
- `<web-capture>[...]</web-capture>` = Robo JSON: outerHTML, computedStyles, cssRules, rect.

## Keeping up with Orca
The Annotate/Grab engine is generated from `stablyai/orca` (MIT), not hand-written.
- Update: `node scripts/sync-orca.mjs && node scripts/test.mjs`, then reload the extension.
- Check only: `node scripts/sync-orca.mjs --check` (exit 1 = upstream moved).
- A weekly GitHub Action does this and opens a PR. If the sync throws "upstream moved: ...", Orca refactored a file this repo extracts from; fix the matching marker in `scripts/sync-orca.mjs`.
- Never edit `extension/vendor/*` or `upstream/*` by hand.
