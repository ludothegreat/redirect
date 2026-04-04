# Redirector — Project Handoff

Everything needed to pick this project up and keep building.

---

## Current State (2026-04-04)

The extension is fully working. It redirects URLs on HTTP navigations (via `declarativeNetRequest`) and on SPA navigations like Facebook's home/logo button (via `webNavigation.onHistoryStateUpdated`). Rules are managed through a dark-themed popup UI with per-rule toggles, add/edit/delete, and two match types (exact / starts with). Installed in developer mode only — no store publishing.

### Branch Status
`main` — all work committed, nothing pending.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension API | WebExtensions (Manifest V3) |
| Browsers | Firefox 113+, Chrome (any current) |
| Language | Vanilla JS (ES2020+), no build step |
| Cross-browser namespace | `webextension-polyfill` (popup only) |
| Redirect engine | `declarativeNetRequest` dynamic rules + `webNavigation` |
| Storage | `browser.storage.local` |

---

## Key Files

| File | Purpose |
|---|---|
| `redirect-extension/manifest.json` | MV3 manifest — dual background key, permissions |
| `redirect-extension/background.js` | Redirect engine — DNR sync, SPA handler, startup |
| `redirect-extension/popup.js` | UI logic — rule CRUD, direct DNR sync |
| `redirect-extension/popup.css` | Dark theme, orange accent |
| `redirect-extension/popup.html` | Popup shell |
| `redirect-extension/rules/empty.json` | `[]` — Firefox 132 bug workaround (do not delete) |
| `redirect-extension/browser-polyfill.js` | webextension-polyfill — popup context only |
| `redirect-extension/content.js` | **Not in manifest** — superseded SPA attempt, kept for reference |

---

## Loading the Extension

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → `redirect-extension/manifest.json`

**Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `redirect-extension/` folder

No build step. Reload from the same screen after any code change.

---

## Architecture Notes

**Two redirect mechanisms** (both needed):
- `declarativeNetRequest` — handles real HTTP requests. Synced from both `background.js` (on startup) and `popup.js` (on every save, directly — no dependency on background).
- `webNavigation.onHistoryStateUpdated` — handles SPA navigations (e.g. Facebook logo click uses `history.pushState`, not HTTP). Background calls `tabs.update(tabId, { url: destination })`.

**Background script has no polyfill** — uses `globalThis.browser ?? globalThis.chrome` directly. Both browsers expose Promise-based APIs for `declarativeNetRequest` and `storage`. Only the popup loads `browser-polyfill.js`.

**Rule ID counter** — stored separately in `storage.local` as `nextRuleId`. IDs are never reused within a browser install.

---

## What's NOT Done

- No way to reorder rules (currently stored/evaluated in insertion order)
- No import/export of rules (e.g. JSON backup, share with spouse)
- Firefox temporary install disappears on browser close — no workaround without signing
- Prefix-match rules can loop if the destination URL starts with the source pattern — `patternMatches()` only guards against exact `url === destination` equality
- Icons are solid-color placeholders — no real icon design
- No visual confirmation when a redirect fires (the address bar flickers briefly — unavoidable)
