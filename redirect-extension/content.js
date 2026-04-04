// content.js — catches SPA navigations that declarativeNetRequest misses.
//
// declarativeNetRequest only fires on real HTTP requests. Facebook (and many
// modern sites) navigate by calling history.pushState instead of loading a new
// page, so clicking the logo or home button never triggers our DNR rules.
// This script wraps pushState/replaceState and the popstate event to catch
// those URL changes and apply the same redirect rules.

function patternMatches(url, rule) {
  // Already at the destination — don't redirect again.
  if (url === rule.destination) return false;

  if (rule.matchType === 'exact') {
    return url === rule.pattern;
  }
  // prefix
  return url.startsWith(rule.pattern);
}

async function checkAndRedirect() {
  const currentUrl = location.href;
  const { redirectRules = [] } = await browser.storage.local.get('redirectRules');

  for (const rule of redirectRules) {
    if (!rule.enabled) continue;
    if (patternMatches(currentUrl, rule)) {
      location.replace(rule.destination);
      return;
    }
  }
}

// Wrap history.pushState and history.replaceState — these are how SPAs
// navigate without triggering a real page load.
const origPushState = history.pushState.bind(history);
const origReplaceState = history.replaceState.bind(history);

history.pushState = function (...args) {
  origPushState(...args);
  checkAndRedirect();
};

history.replaceState = function (...args) {
  origReplaceState(...args);
  checkAndRedirect();
};

// popstate fires on back/forward browser navigation.
window.addEventListener('popstate', checkAndRedirect);
