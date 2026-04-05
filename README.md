# Redirector

A cross-browser WebExtension that redirects URLs based on user-defined rules. Supports Firefox and Chrome.

## Install

No build step required. Load the extension directly from source.

**Firefox:**
1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `redirect-extension/manifest.json`

**Chrome:**
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `redirect-extension/` folder

Reload the extension from the same page after any code change.

> **Note:** Firefox temporary extensions are removed when the browser closes.

## Usage

Click the Redirector icon in the toolbar to open the popup.

### Adding a rule

1. Enter the source URL in the **From** field
2. Select a match type:
   - **Exact URL** - redirects only when the full URL matches
   - **Starts with** - redirects any URL that begins with the pattern
3. Enter the destination URL in the **To** field
4. Click **Add Rule**

### URL normalization

- Bare domains are accepted - `facebook.com` automatically becomes `https://facebook.com/`
- Trailing slashes and URL formatting are normalized on input
- Both `www` and non-`www` variants are matched automatically
- A match preview is shown below the form so you can verify what will be matched before saving

### Set HTTP (insecure)

Check this box when creating rules for local or non-HTTPS services (e.g. `http://localhost:3000`). When checked, URLs are set to `http://` instead of `https://`.

### Managing rules

- **Toggle** - enable or disable a rule with the switch
- **Edit** - hover over a rule and click ✎
- **Delete** - hover over a rule and click ✕

## How it works

Redirector uses two mechanisms to catch navigations:

- **declarativeNetRequest** - intercepts standard HTTP navigations (typed URLs, links, page loads)
- **webNavigation** - intercepts SPA navigations that use the History API (e.g. `history.pushState`)

Rules are stored in `browser.storage.local` and persist across browser sessions.

## Permissions

| Permission | Purpose |
|---|---|
| `declarativeNetRequest` | Register URL redirect rules |
| `storage` | Store redirect rules |
| `webNavigation` | Detect SPA navigations |
| `<all_urls>` | Required for redirect rules to function |

## License

MIT
