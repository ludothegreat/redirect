// Chrome MV3 uses a service worker where browser.* isn't natively available.
// Firefox has browser.* natively. Use whichever is present.
const api = globalThis.browser ?? globalThis.chrome;

function patternToUrlFilter(pattern, matchType) {
  // Escape * and ^ which have special meaning in declarativeNetRequest urlFilter syntax.
  const escaped = pattern.replace(/\*/g, '\\*').replace(/\^/g, '\\^');
  // | at start = URL must begin with this string
  // | at end   = URL must end with this string
  return matchType === 'exact' ? '|' + escaped + '|' : '|' + escaped;
}

// Returns true if url should be redirected by this rule.
function patternMatches(url, rule) {
  // Already at the destination — don't redirect again.
  if (url === rule.destination) return false;
  if (rule.matchType === 'exact') return url === rule.pattern;
  return url.startsWith(rule.pattern);
}

async function loadRules() {
  const result = await api.storage.local.get('redirectRules');
  return result.redirectRules ?? [];
}

async function syncRulesToDNR(rules) {
  const existing = await api.declarativeNetRequest.getDynamicRules();
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

  await api.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

// declarativeNetRequest catches regular HTTP navigations, but SPAs navigate
// by calling history.pushState/replaceState — no HTTP request goes out, so
// DNR never fires. webNavigation.onHistoryStateUpdated is a browser-level
// event that fires for those History API calls regardless of how the page
// implements them. We respond by navigating the tab to the destination.
api.webNavigation.onHistoryStateUpdated.addListener(async ({ tabId, url }) => {
  const rules = await loadRules();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (patternMatches(url, rule)) {
      await api.tabs.update(tabId, { url: rule.destination });
      return;
    }
  }
});

api.runtime.onStartup.addListener(async () => {
  const rules = await loadRules();
  await syncRulesToDNR(rules);
});

api.runtime.onInstalled.addListener(async () => {
  const rules = await loadRules();
  await syncRulesToDNR(rules);
});

api.runtime.onMessage.addListener(async msg => {
  if (msg.type === 'sync-rules') {
    const rules = await loadRules();
    await syncRulesToDNR(rules);
  }
});
