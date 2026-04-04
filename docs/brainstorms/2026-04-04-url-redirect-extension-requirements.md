---
date: 2026-04-04
topic: url-redirect-extension
---

# URL Redirect Browser Extension

## Problem Frame

The user wants to automatically redirect specific URLs to preferred alternatives — for example, forcing Facebook's homepage to load their chronological friends-only feed instead of the algorithmic one. The redirect must be precise enough to target specific pages within a domain without catching all URLs on that domain. The extension must be easy for a non-technical user (spouse) to manage, and portable between Firefox and Chrome.

## Requirements

- R1. The extension redirects a browser request to a destination URL when the visited URL matches an active rule's pattern, before the original page loads.
- R2. URL pattern matching must support targeting specific pages within a domain (e.g. redirect `https://www.facebook.com/` but not `https://www.facebook.com/friends/`).
- R3. Each redirect rule has an individual on/off toggle. Disabled rules are ignored; the browser loads the original URL as normal.
- R4. Clicking the extension icon opens a popup listing all rules, each showing its source pattern, destination, and on/off toggle.
- R5. The popup provides the ability to add, edit, and delete redirect rules.
- R6. Rules and their enabled/disabled state persist across browser restarts.
- R7. The extension runs in both Firefox and Chrome when loaded in developer/unpacked mode.

## Success Criteria

- Clicking a link to `facebook.com` lands on the preferred feed URL without seeing the default feed, when the rule is enabled.
- Disabling a rule for a site causes the original URL to load as normal.
- A non-technical user can add a new redirect rule without editing any files.
- The same extension codebase loads and works in both Firefox and Chrome without modification.

## Scope Boundaries

- No extension store publishing — installed via developer/unpacked mode only.
- No sync between browsers or devices — each browser install manages its own rules.
- No regex or advanced pattern syntax exposed to the user — matching should be simple enough for a non-technical user to configure correctly.
- No global on/off master switch — per-rule toggles are sufficient.

## Key Decisions

- **Per-rule toggles only (no global toggle):** Gives finer control without extra UI complexity.
- **Popup as primary UI:** Fastest access to toggles and rule management; no need for a separate settings page.
- **Developer mode installation:** Avoids store review and signing overhead; acceptable for personal and family use.

## Dependencies / Assumptions

- Both browsers support the WebExtensions API (`manifest.json`, `declarativeNetRequest` or `webRequest`), which is standard for cross-browser extensions.
- The user is comfortable loading an unpacked extension via each browser's developer mode (a one-time setup step per browser).

## Outstanding Questions

### Resolve Before Planning

_(none)_

### Deferred to Planning

- [Affects R1, R2][Technical] Whether to use `declarativeNetRequest` (declarative, Chrome-preferred) or `webRequest` (more flexible, better Firefox support) for intercepting and redirecting requests — tradeoffs around manifest v2 vs v3 compatibility affect this choice.
- [Affects R2][Technical] Exact matching model to expose in the UI — prefix match, contains, or exact — needs to balance simplicity for the user with enough precision to handle intra-domain targeting.

## Next Steps

→ `/ce:plan` for structured implementation planning
