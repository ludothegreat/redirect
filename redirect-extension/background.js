// In Chrome MV3 the background runs as a service worker, so browser-polyfill
// is not loaded via the manifest scripts array. Import it here when needed.
if (typeof browser === 'undefined') {
  importScripts('browser-polyfill.js');
}

// Convert a user-supplied URL pattern and match type into a declarativeNetRequest
// urlFilter string.
//
// urlFilter special characters:
//   |  at start = URL must start with following string
//   |  at end   = URL must end with preceding string
//   *            = wildcard (any sequence of characters)
//   ^            = separator anchor (any non-letter/digit/underscore/-/./%)
//
// We escape * and ^ in user input so they are treated as literals.
function patternToUrlFilter(pattern, matchType) {
  const escaped = pattern.replace(/\*/g, '\\*').replace(/\^/g, '\\^');
  if (matchType === 'exact') {
    return '|' + escaped + '|';
  }
  // prefix: match any URL starting with this string
  return '|' + escaped;
}

async function loadRules() {
  const result = await browser.storage.local.get('redirectRules');
  return result.redirectRules ?? [];
}

async function syncRulesToDNR(rules) {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  const addRules = rules
    .filter(r => r.enabled)
    .map(r => ({
      id: r.id,
      priority: 1,
      condition: {
        urlFilter: patternToUrlFilter(r.pattern, r.matchType),
        resourceTypes: ['main_frame'],
      },
      action: {
        type: 'redirect',
        redirect: { url: r.destination },
      },
    }));

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

browser.runtime.onStartup.addListener(async () => {
  const rules = await loadRules();
  await syncRulesToDNR(rules);
});

browser.runtime.onInstalled.addListener(async () => {
  const rules = await loadRules();
  await syncRulesToDNR(rules);
});

browser.runtime.onMessage.addListener(async msg => {
  if (msg.type === 'sync-rules') {
    const rules = await loadRules();
    await syncRulesToDNR(rules);
  }
});
