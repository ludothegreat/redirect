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

// Toggle www prefix: www.facebook.com → facebook.com, facebook.com → www.facebook.com
function wwwVariant(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith('www.')
      ? u.hostname.slice(4)
      : 'www.' + u.hostname;
    return u.href;
  } catch { return null; }
}

// Returns true if url should be redirected by this rule.
// Checks both the stored pattern and its www/non-www counterpart.
function patternMatches(url, rule) {
  if (url === rule.destination) return false;
  const patterns = [rule.pattern];
  const variant = wwwVariant(rule.pattern);
  if (variant) patterns.push(variant);
  for (const p of patterns) {
    if (rule.matchType === 'exact' && url === p) return true;
    if (rule.matchType !== 'exact' && url.startsWith(p)) return true;
  }
  return false;
}

async function loadRules() {
  const result = await api.storage.local.get('redirectRules');
  return result.redirectRules ?? [];
}

const WWW_ID_OFFSET = 100000;

async function syncRulesToDNR(rules) {
  const existing = await api.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  const addRules = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    addRules.push({
      id: r.id,
      priority: 1,
      condition: {
        urlFilter: patternToUrlFilter(r.pattern, r.matchType),
        resourceTypes: ['main_frame'],
      },
      action: { type: 'redirect', redirect: { url: r.destination } },
    });
    // Also match the www/non-www counterpart so users don't need to care.
    const variant = wwwVariant(r.pattern);
    if (variant) {
      addRules.push({
        id: r.id + WWW_ID_OFFSET,
        priority: 1,
        condition: {
          urlFilter: patternToUrlFilter(variant, r.matchType),
          resourceTypes: ['main_frame'],
        },
        action: { type: 'redirect', redirect: { url: r.destination } },
      });
    }
  }

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
