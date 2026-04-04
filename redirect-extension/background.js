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
