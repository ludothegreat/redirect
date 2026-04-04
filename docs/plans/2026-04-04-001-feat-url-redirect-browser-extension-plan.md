---
title: URL Redirect Browser Extension
type: feat
status: active
date: 2026-04-04
origin: docs/brainstorms/2026-04-04-url-redirect-extension-requirements.md
---

# feat: URL Redirect Browser Extension

## Overview

Build a cross-browser WebExtension (Firefox + Chrome) that intercepts navigation requests and redirects URLs matching user-defined rules to preferred destinations. Rules are managed through a popup UI — no file editing required. Each rule can be individually toggled on or off. The extension is installed in developer/unpacked mode only.

## Problem Statement / Motivation

Default URL behavior doesn't always go where the user wants. The primary use case is Facebook: clicking any link to `facebook.com` lands on the algorithmic feed, full of ads and unwanted content. The user wants to land on their chronological friends-only feed (`/?filter=all&sk=h_chr`) instead — automatically, without remembering to navigate there manually.

The extension must be usable by a non-technical user (the user's spouse) who can add and manage redirect rules without editing any files.

## Proposed Solution

A Manifest V3 WebExtension using `declarativeNetRequest` dynamic rules for URL interception. Rules are stored in `browser.storage.local` and synced to the browser's redirect engine on every change and on startup. The popup (opened by clicking the extension icon) serves as the complete UI for adding, toggling, editing, and deleting rules.

**Resolved technical decisions (see origin: docs/brainstorms/2026-04-04-url-redirect-extension-requirements.md):**

- **Manifest V3** — MV2 is disabled in Chrome as of July 2025 (Chrome 139+). MV3 is the only viable choice for Chrome. Firefox supports both; MV3 is the forward-compatible target.
- **`declarativeNetRequest` with dynamic rules** — `webRequestBlocking` is dead in Chrome MV3. `declarativeNetRequest` works identically in both browsers, persists dynamic rules across restarts, and supports up to 5,000 dynamic rules (more than sufficient for personal use).
- **`browser.storage.local`** — stores user-defined rules. Preferred over `storage.sync` due to its larger quota (10 MB vs 102 KB) and no dependency on a browser account.
- **`browser.*` namespace via `webextension-polyfill`** — provides a consistent Promise-based API in both browsers; Chrome normally only exposes `chrome.*`.
- **Per-rule on/off toggle** — no global switch; (see origin).
- **Popup as primary UI** — no separate settings page; (see origin).
- **Developer mode installation only** — no store publishing; (see origin).

## File Layout

```
redirect-extension/
├── manifest.json          # MV3 cross-browser manifest
├── background.js          # startup sync, message handler
├── popup.html             # popup shell
├── popup.js               # popup logic (add, toggle, edit, delete)
├── popup.css              # popup styling
├── browser-polyfill.js    # webextension-polyfill (copy from npm dist/)
├── rules/
│   └── empty.json         # [] — Firefox 132 bug workaround
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Technical Approach

### Manifest (`manifest.json`)

MV3 with both `scripts` and `service_worker` in the `background` key — Firefox picks `scripts`, Chrome picks `service_worker`. The `browser_specific_settings.gecko` block is silently ignored by Chrome.

```json
{
  "manifest_version": 3,
  "name": "Redirector",
  "version": "1.0.0",
  "description": "Redirect URLs to your preferred destinations.",
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "48": "icons/icon-48.png" }
  },
  "background": {
    "scripts": ["browser-polyfill.js", "background.js"],
    "service_worker": "background.js"
  },
  "permissions": ["declarativeNetRequest", "declarativeNetRequestFeedback", "storage"],
  "host_permissions": ["<all_urls>"],
  "declarative_net_request": {
    "rule_resources": [
      { "id": "empty_ruleset", "enabled": true, "path": "rules/empty.json" }
    ]
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "redirector@local",
      "strict_min_version": "113.0"
    }
  },
  "icons": { "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

**Why `declarativeNetRequestFeedback`:** allows reading back active rules via `getDynamicRules()` for display in the popup. Without it, the popup can't confirm which rules are loaded.

**Why `host_permissions: <all_urls>`:** `declarativeNetRequest` requires host permissions for both source and destination URLs to perform redirects. A general-purpose redirect tool needs all-urls scope.

**Why the empty static ruleset:** Firefox 132 and earlier had a bug where dynamic rules failed to activate after browser restart if no static ruleset existed. The empty `rules/empty.json` (`[]`) costs nothing and fixes older Firefox versions.

### URL Storage Format (`storage.local`)

Rules are stored as a JSON array under the key `"redirectRules"`:

```js
[
  {
    id: 1,
    pattern: "https://www.facebook.com/",
    matchType: "exact",   // "exact" | "prefix"
    destination: "https://www.facebook.com/?filter=all&sk=h_chr",
    enabled: true
  }
]
```

`id` is a stable integer assigned at creation time (auto-incrementing, stored separately as `"nextRuleId"`). IDs are never reused within a session.

### URL Matching Model

The UI exposes two match types, simple enough for a non-technical user:

- **Exact** — redirects only this precise URL (ignoring query string and hash on the source pattern)
- **Starts with** — redirects any URL that begins with the pattern

Behind the scenes, these are converted to `declarativeNetRequest` `urlFilter` values:
- Exact → `|https://www.facebook.com/|` (leading and trailing `|` anchor both ends)
- Starts with → `|https://www.facebook.com/` (leading `|` anchors the start only)

Special characters in the pattern that conflict with `urlFilter` syntax (`*`, `|`, `^`) are escaped before writing the DNR rule.

### Background Script (`background.js`)

Responsible for: syncing storage rules to DNR on startup, and handling sync messages from the popup.

```js
// Runs when extension loads or browser starts
async function syncRulesToDNR(rules) {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const toRemove = existing.map(r => r.id);
  const toAdd = rules
    .filter(r => r.enabled)
    .map(r => ({
      id: r.id,
      priority: 1,
      condition: {
        urlFilter: patternToUrlFilter(r.pattern, r.matchType),
        resourceTypes: ["main_frame"]
      },
      action: {
        type: "redirect",
        redirect: { url: r.destination }
      }
    }));
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: toRemove,
    addRules: toAdd
  });
}

browser.runtime.onStartup.addListener(async () => {
  const { redirectRules = [] } = await browser.storage.local.get("redirectRules");
  await syncRulesToDNR(redirectRules);
});

browser.runtime.onInstalled.addListener(async () => {
  const { redirectRules = [] } = await browser.storage.local.get("redirectRules");
  await syncRulesToDNR(redirectRules);
});

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "sync-rules") {
    const { redirectRules = [] } = await browser.storage.local.get("redirectRules");
    await syncRulesToDNR(redirectRules);
  }
});
```

### Popup UI (`popup.html` / `popup.js` / `popup.css`)

The popup shows:
1. A list of existing rules — each with source pattern, destination, match type label, enabled toggle, edit button, and delete button.
2. An "Add rule" form at the bottom with: source URL field, match type selector (Exact / Starts with), destination URL field, and Add button.
3. An inline edit form that replaces a rule row when the edit button is clicked.

**Popup constraints:**
- No inline JS (CSP blocks it) — all handlers via `addEventListener`
- Width set on `body` (Chrome quirk — `:root` width is ignored for popup sizing)
- Max height ~600px in Chrome; use `overflow-y: auto` on the rule list
- Popup closes on focus loss — keep all operations synchronous or fire-and-forget

### Data Flow

```
User changes rule in popup
  → popup.js writes to storage.local
  → popup.js sends { type: "sync-rules" } to background
  → background.js calls syncRulesToDNR()
  → DNR dynamic rules updated
  → next navigation request matched against new rules
```

On browser restart:
```
browser fires runtime.onStartup
  → background.js loads rules from storage.local
  → syncRulesToDNR() applied
  → ready before any navigation
```

## Implementation Phases

### Phase 1: Skeleton (extension loads, no rules yet)

- [ ] `manifest.json` — complete MV3 cross-browser manifest
- [ ] `rules/empty.json` — `[]` (Firefox bug workaround)
- [ ] `browser-polyfill.js` — download from `https://unpkg.com/webextension-polyfill/dist/browser-polyfill.min.js`
- [ ] `background.js` — startup/install listeners, sync function, message handler
- [ ] Placeholder `icons/` (can be simple colored squares initially)
- [ ] Verify extension loads in both Firefox (about:debugging → Load Temporary Add-on) and Chrome (chrome://extensions → Load unpacked)

### Phase 2: Popup rule management

- [ ] `popup.html` — shell with rule list container and add-rule form
- [ ] `popup.js` — render rules from storage, add/delete/toggle handlers, form submission, send sync message to background
- [ ] `popup.css` — clean readable layout, toggle styling, 400px width on body
- [ ] `patternToUrlFilter()` helper shared between popup and background (or duplicated — it's small)
- [ ] Verify: add a rule → close popup → navigate to source URL → confirm redirect fires

### Phase 3: Edit and polish

- [ ] Inline edit form — clicking Edit on a rule replaces the row with an editable form
- [ ] Input validation — warn if destination is not a valid `http://` or `https://` URL; warn if pattern is empty
- [ ] Empty state — show a friendly message when no rules exist yet, with a hint to add the first one
- [ ] Styling pass — consistent spacing, readable font, clear toggle affordance

## Acceptance Criteria

- [ ] Navigating to `https://www.facebook.com/` redirects to `https://www.facebook.com/?filter=all&sk=h_chr` when the rule is enabled (R1)
- [ ] Navigating to `https://www.facebook.com/friends/` is NOT redirected when using an exact-match rule for `https://www.facebook.com/` (R2)
- [ ] Disabling a rule's toggle causes the original URL to load as normal (R3)
- [ ] Clicking the extension icon opens a popup listing all rules (R4)
- [ ] Rules can be added, edited, and deleted from the popup without touching any files (R5)
- [ ] Rules survive a browser restart — close and reopen the browser, navigate to the source URL, confirm redirect still fires (R6)
- [ ] The extension loads and operates correctly in both Firefox (about:debugging) and Chrome (chrome://extensions) without code changes (R7)
- [ ] A non-technical user can add a new redirect rule by entering a URL and a destination in the popup form

## System-Wide Impact

- **No web page modifications** — the extension intercepts at the network layer via `declarativeNetRequest`; it does not inject scripts into pages.
- **`<all_urls>` host permission** — users will see a broad permissions warning on install. This is unavoidable for a general-purpose redirect tool. The extension does not read or transmit page content.
- **`declarativeNetRequest` priority** — if the user has other extensions that also use DNR redirect rules, rule priority and ordering across extensions is browser-managed and not controllable. Edge case, unlikely to affect personal use.

## Dependencies & Risks

- **`webextension-polyfill`** — single JS file, no build step. Download once and commit.
- **Chrome MV3 service worker:** background.js is terminated by Chrome when idle. This is fine — all redirect rules are owned by the DNR engine (not the background script), so rules stay active even when the background script is asleep.
- **Firefox `service_worker` not implemented:** Firefox MV3 ignores the `service_worker` field and uses `scripts` instead (bug 1573659, open as of early 2026). The dual-key pattern in the manifest handles this.
- **DNR rule limit:** 5,000 dynamic rules maximum. Not a practical concern for personal use.
- **`urlFilter` escaping:** the `|` and `^` characters have special meaning in DNR `urlFilter` syntax. URL patterns containing these characters must be escaped before being passed to DNR. Most real-world URLs don't contain them, but the helper must handle it.

## Outstanding Questions (Deferred to Planning — now resolved)

- ✅ **`declarativeNetRequest` vs `webRequest`:** Use `declarativeNetRequest` — `webRequest` blocking is unavailable in Chrome MV3.
- ✅ **Matching model:** Expose "Exact" and "Starts with" to the user; convert to `urlFilter` syntax internally.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-04-url-redirect-extension-requirements.md](../brainstorms/2026-04-04-url-redirect-extension-requirements.md)
  - Key decisions carried forward: per-rule toggles (no global switch), popup as primary UI, developer mode installation only

### External References

- [declarativeNetRequest.updateDynamicRules — MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/updateDynamicRules)
- [Build a cross-browser extension — MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Build_a_cross_browser_extension)
- [webextension-polyfill — GitHub (Mozilla)](https://github.com/mozilla/webextension-polyfill)
- [Manifest V2 deprecation timeline — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)
- [webextensions-examples dnr-dynamic-with-options — GitHub](https://github.com/mdn/webextensions-examples/tree/main/dnr-dynamic-with-options)

## Next Steps

→ `/ce:work` to implement Phase 1 through Phase 3
