// ── URL filter helpers (duplicated from background.js intentionally — popup
//    syncs DNR directly so rules apply immediately without depending on the
//    background service worker being alive) ──────────────────────────────────

function patternToUrlFilter(pattern, matchType) {
  const escaped = pattern.replace(/\*/g, '\\*').replace(/\^/g, '\\^');
  return matchType === 'exact' ? '|' + escaped + '|' : '|' + escaped;
}

async function syncToDNR(rules) {
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

// ── Storage helpers ───────────────────────────────────────────────────────────

async function loadRules() {
  const result = await browser.storage.local.get('redirectRules');
  return result.redirectRules ?? [];
}

async function saveRules(rules) {
  await browser.storage.local.set({ redirectRules: rules });
  // Sync to DNR directly — don't rely on background receiving a message.
  await syncToDNR(rules);
}

async function nextId() {
  const result = await browser.storage.local.get('nextRuleId');
  const id = result.nextRuleId ?? 1;
  await browser.storage.local.set({ nextRuleId: id + 1 });
  return id;
}

// ── Validation ────────────────────────────────────────────────────────────────

// Canonical form: prepend https:// if no scheme, upgrade http→https unless
// allowHttp is true, then normalize via URL parser.
function normalizeUrl(raw, allowHttp) {
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  const url = new URL(raw);
  if (!allowHttp && url.protocol === 'http:') url.protocol = 'https:';
  return url.href;
}

function normalizeUrlInput(input, allowHttp) {
  const raw = input.value.trim();
  if (!raw) return;
  try { input.value = normalizeUrl(raw, allowHttp); } catch { /* validator will complain */ }
}

function urlError(value, fieldName) {
  if (!value) return `${fieldName} is required.`;
  try {
    let v = value;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return `${fieldName} must start with http:// or https://`;
    }
  } catch {
    return `${fieldName} is not a valid URL.`;
  }
  return null;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function truncate(str, max = 38) {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function matchLabel(matchType) {
  return matchType === 'exact' ? 'exact' : 'starts with';
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function renderRules(rules) {
  const list = document.getElementById('rule-list');
  const empty = document.getElementById('empty-state');

  clearChildren(list);

  if (rules.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  rules.forEach(rule => {
    list.appendChild(buildRuleRow(rule));
  });
}

function buildRuleRow(rule) {
  const row = document.createElement('div');
  row.className = 'rule-row' + (rule.enabled ? '' : ' rule-disabled');
  row.dataset.id = rule.id;

  // Toggle
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle';
  toggleLabel.title = rule.enabled ? 'Disable rule' : 'Enable rule';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = rule.enabled;
  checkbox.addEventListener('change', () => handleToggle(rule.id, checkbox.checked));

  const slider = document.createElement('span');
  slider.className = 'slider';

  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(slider);

  // Rule info
  const info = document.createElement('div');
  info.className = 'rule-info';

  const fromEl = document.createElement('div');
  fromEl.className = 'rule-from';
  fromEl.textContent = truncate(rule.pattern);
  fromEl.title = rule.pattern;

  const meta = document.createElement('div');
  meta.className = 'rule-meta';
  meta.textContent = matchLabel(rule.matchType) + ' \u2192 ' + truncate(rule.destination, 32);
  meta.title = rule.destination;

  info.appendChild(fromEl);
  info.appendChild(meta);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'rule-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-icon';
  editBtn.title = 'Edit rule';
  editBtn.textContent = '\u270e';
  editBtn.addEventListener('click', () => showEditForm(rule, row));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon btn-danger';
  deleteBtn.title = 'Delete rule';
  deleteBtn.textContent = '\u2715';
  deleteBtn.addEventListener('click', () => handleDelete(rule.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  row.appendChild(toggleLabel);
  row.appendChild(info);
  row.appendChild(actions);

  return row;
}

function makeInput(type, value, placeholder, required) {
  const el = document.createElement('input');
  el.type = type;
  el.value = value;
  el.placeholder = placeholder;
  el.required = required;
  return el;
}

function makeSelect(options, selectedValue) {
  const select = document.createElement('select');
  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = selectedValue === value;
    select.appendChild(opt);
  });
  return select;
}

function showEditForm(rule, row) {
  const form = document.createElement('form');
  form.className = 'edit-form';
  form.autocomplete = 'off';

  const isHttp = rule.pattern.startsWith('http://') || rule.destination.startsWith('http://');

  const patternInput = makeInput('text', rule.pattern, 'facebook.com or https://example.com/', true);
  const matchSelect = makeSelect(
    [{ value: 'exact', label: 'Exact URL' }, { value: 'prefix', label: 'Starts with' }],
    rule.matchType
  );
  const destInput = makeInput('text', rule.destination, 'https://example.com/preferred', true);

  const httpRow = document.createElement('label');
  httpRow.className = 'allow-http-label';
  const httpCheckbox = document.createElement('input');
  httpCheckbox.type = 'checkbox';
  httpCheckbox.checked = isHttp;
  const httpSpan = document.createElement('span');
  httpSpan.textContent = 'Allow HTTP (insecure)';
  httpRow.appendChild(httpCheckbox);
  httpRow.appendChild(httpSpan);

  patternInput.addEventListener('blur', () => normalizeUrlInput(patternInput, httpCheckbox.checked));
  destInput.addEventListener('blur', () => normalizeUrlInput(destInput, httpCheckbox.checked));

  const errorEl = document.createElement('div');
  errorEl.className = 'field-error';

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-btn-row';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn-primary btn-sm';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary btn-sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', async () => {
    const rules = await loadRules();
    renderRules(rules);
  });

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  form.appendChild(patternInput);
  form.appendChild(matchSelect);
  form.appendChild(destInput);
  form.appendChild(httpRow);
  form.appendChild(errorEl);
  form.appendChild(btnRow);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const matchType = matchSelect.value;
    const rawPattern = patternInput.value.trim();
    const rawDest = destInput.value.trim();

    const err = urlError(rawPattern, 'Source URL') || urlError(rawDest, 'Destination URL');
    if (err) {
      errorEl.textContent = err;
      return;
    }
    errorEl.textContent = '';

    const allowHttp = httpCheckbox.checked;
    const pattern = normalizeUrl(rawPattern, allowHttp);
    const destination = normalizeUrl(rawDest, allowHttp);

    const rules = await loadRules();
    const idx = rules.findIndex(r => r.id === rule.id);
    if (idx !== -1) {
      rules[idx] = { ...rules[idx], pattern, matchType, destination };
      await saveRules(rules);
      renderRules(rules);
    }
  });

  row.replaceWith(form);
  patternInput.focus();
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleToggle(id, enabled) {
  const rules = await loadRules();
  const rule = rules.find(r => r.id === id);
  if (!rule) return;
  rule.enabled = enabled;
  await saveRules(rules);
  renderRules(rules);
}

async function handleDelete(id) {
  const rules = await loadRules();
  const updated = rules.filter(r => r.id !== id);
  await saveRules(updated);
  renderRules(updated);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const rules = await loadRules();
  renderRules(rules);

  const form = document.getElementById('add-rule-form');
  const patternInput = document.getElementById('input-pattern');
  const matchSelect = document.getElementById('input-match-type');
  const destInput = document.getElementById('input-destination');
  const matchPreview = document.getElementById('match-preview');
  const allowHttpCheckbox = document.getElementById('input-allow-http');

  function updateMatchPreview() {
    const val = patternInput.value;
    if (!val) { matchPreview.hidden = true; return; }
    matchPreview.textContent = matchSelect.value === 'exact'
      ? 'Exact match: ' + val
      : 'Starts with: ' + val;
    matchPreview.hidden = false;
  }

  patternInput.addEventListener('blur', () => { normalizeUrlInput(patternInput, allowHttpCheckbox.checked); updateMatchPreview(); });
  destInput.addEventListener('blur', () => normalizeUrlInput(destInput, allowHttpCheckbox.checked));
  matchSelect.addEventListener('change', updateMatchPreview);

  const errorEl = document.createElement('div');
  errorEl.className = 'field-error';
  form.querySelector('.form-actions').before(errorEl);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const matchType = matchSelect.value;
    const rawPattern = patternInput.value.trim();
    const rawDest = destInput.value.trim();

    const err = urlError(rawPattern, 'Source URL') || urlError(rawDest, 'Destination URL');
    if (err) {
      errorEl.textContent = err;
      return;
    }
    errorEl.textContent = '';

    const allowHttp = allowHttpCheckbox.checked;
    const pattern = normalizeUrl(rawPattern, allowHttp);
    const destination = normalizeUrl(rawDest, allowHttp);

    const id = await nextId();
    const existingRules = await loadRules();
    existingRules.push({ id, pattern, matchType, destination, enabled: true });
    await saveRules(existingRules);
    renderRules(existingRules);
    form.reset();
    patternInput.focus();
  });
});
