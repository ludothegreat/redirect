# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A cross-browser WebExtension (Firefox + Chrome) that redirects URLs based on user-defined rules. Installed in developer/unpacked mode — not published to any extension store.

## Loading the extension

**Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on → select `redirect-extension/manifest.json`

**Chrome:** `chrome://extensions` → enable Developer mode → Load unpacked → select the `redirect-extension/` folder

After any code change, reload the extension from the same screen. There is no build step — the files are loaded directly.

## Architecture

The extension has three active files and no build toolchain:

**`manifest.json`** — Manifest V3. Dual `background` key (`scripts` for Firefox, `service_worker` for Chrome — both point to `background.js`). Requires `declarativeNetRequest`, `storage`, and `webNavigation` permissions plus `<all_urls>` host permissions.

**`background.js`** — The redirect engine. Uses `globalThis.browser ?? globalThis.chrome` (no polyfill — both browsers expose Promise-based APIs for `declarativeNetRequest` and `storage` natively). Has two redirect mechanisms:
1. `declarativeNetRequest` dynamic rules — catches normal HTTP navigations (typed URLs, external links, page refreshes). Synced via `syncRulesToDNR()` on install, startup, and when the popup saves a change.
2. `webNavigation.onHistoryStateUpdated` — catches SPA navigations (sites like Facebook that call `history.pushState` instead of making a real HTTP request). Responds by calling `tabs.update(tabId, { url: destination })`.

**`popup.js`** — The UI. Loaded with `browser-polyfill.js` so it uses `browser.*` throughout. Calls `declarativeNetRequest.updateDynamicRules()` directly after every rule change — does not depend on the background being alive to apply rules. Rules are stored in `browser.storage.local` as `redirectRules` (array) and `nextRuleId` (integer counter). IDs are stable integers ≥ 1, never reused.

**`content.js`** — Present in the repo but not wired into the manifest. Was an earlier attempt at SPA redirect handling, superseded by the `webNavigation` approach in `background.js`.

## Rule data shape

```js
// storage.local key: "redirectRules"
[
  {
    id: 1,               // stable integer, never reused
    pattern: "https://www.facebook.com/",
    matchType: "exact",  // "exact" | "prefix"
    destination: "https://www.facebook.com/?filter=all&sk=h_chr",
    enabled: true
  }
]
```

`patternToUrlFilter(pattern, matchType)` converts a rule into a DNR `urlFilter` string: exact → `|pattern|`, prefix → `|pattern`. Special chars `*` and `^` are escaped.

`patternMatches(url, rule)` is used by the webNavigation listener to check SPA navigations. Guards against redirect loops by returning false when `url === rule.destination`.

## Key constraints

- No inline JS in any extension page — MV3 Content Security Policy blocks it. All handlers must use `addEventListener`.
- Popup width must be set on `body`, not `:root` or `html` (Chrome quirk for popup sizing).
- `rules/empty.json` (`[]`) must exist — works around a Firefox 132 bug where dynamic DNR rules fail to activate after restart when no static ruleset is declared.
- `browser-polyfill.js` is only loaded in popup context (via `<script>` tag in `popup.html`). The background script does not use it — it uses the native `chrome.*` / `browser.*` API directly.
- `declarativeNetRequest` redirect rules require `<all_urls>` host permissions — the `declarativeNetRequest` permission alone is not sufficient for redirects.
- Prefix-match rules can cause infinite redirect loops if the destination URL starts with the source pattern. The current `patternMatches` guard only checks exact equality with `rule.destination`; extend with care.

## Docs

- `docs/brainstorms/` — product requirements document
- `docs/plans/` — implementation plan with full technical rationale
