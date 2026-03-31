/**
 * popup.js — Popup UI Controller
 *
 * Loads config from storage, renders state, handles all user interactions,
 * and persists changes back to chrome.storage.sync.
 */

'use strict';

// ─── Elements ─────────────────────────────────────────────────────────────────

const masterToggle      = document.getElementById('master-toggle');
const toggleLabel       = document.getElementById('toggle-label');
const modeRadios        = document.querySelectorAll('input[name="mode"]');
const detectionChecks   = document.querySelectorAll('[data-detection]');
const statCount         = document.getElementById('stat-count');

// Custom words
const toggleCustomBtn   = document.getElementById('toggle-custom-words');
const customPreview     = document.getElementById('custom-words-preview');
const customEditor      = document.getElementById('custom-words-editor');
const customInput       = document.getElementById('custom-words-input');
const saveCustomBtn     = document.getElementById('save-custom-words');
const cancelCustomBtn   = document.getElementById('cancel-custom-words');

// Profiles
const profileSelect     = document.getElementById('profile-select');
const saveProfileBtn    = document.getElementById('save-profile');
const exportProfileBtn  = document.getElementById('export-profile');
const importProfileBtn  = document.getElementById('import-profile');
const importFileInput   = document.getElementById('import-file-input');

// Selector editor
const toggleSelectorsBtn = document.getElementById('toggle-selectors');
const selectorEditor     = document.getElementById('selector-editor');
const selectorInput      = document.getElementById('selector-input');
const saveSelectorsBtn   = document.getElementById('save-selectors');
const cancelSelectorsBtn = document.getElementById('cancel-selectors');

// ─── State ────────────────────────────────────────────────────────────────────

let config = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.sync.get(['demoShieldConfig']);
  config = result.demoShieldConfig || getDefaultConfig();
  renderAll();
  bindEvents();
  pollStats();
});

// ─── Render ───────────────────────────────────────────────────────────────────

function renderAll() {
  renderToggle();
  renderMode();
  renderDetection();
  renderCustomWordsPreview();
  renderProfiles();
  renderSelectors();
}

function renderToggle() {
  masterToggle.checked = config.enabled;
  toggleLabel.textContent = config.enabled ? 'ON' : 'OFF';
}

function renderMode() {
  modeRadios.forEach(radio => {
    radio.checked = radio.value === config.mode;
  });
}

function renderDetection() {
  detectionChecks.forEach(cb => {
    const key = cb.dataset.detection;
    cb.checked = config.detection[key] !== false;
  });
}

function renderCustomWordsPreview() {
  const words = config.customWords || [];
  customPreview.innerHTML = '';
  const visible = words.slice(0, 5);
  visible.forEach(w => {
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    chip.textContent = w;
    customPreview.appendChild(chip);
  });
  if (words.length > 5) {
    const chip = document.createElement('span');
    chip.className = 'word-chip word-chip-more';
    chip.textContent = `+${words.length - 5} more`;
    customPreview.appendChild(chip);
  }
  if (words.length === 0) {
    customPreview.innerHTML = '<span style="font-size:11px;color:#aaa;font-style:italic">None configured</span>';
  }
}

function renderProfiles() {
  const profiles = config.profiles || {};
  // Clear existing options except default
  while (profileSelect.options.length > 1) profileSelect.remove(1);

  Object.keys(profiles).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    profileSelect.appendChild(opt);
  });
}

function renderSelectors() {
  selectorInput.value = JSON.stringify(config.selectorRules || [], null, 2);
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  // Master toggle
  masterToggle.addEventListener('change', async () => {
    config.enabled = masterToggle.checked;
    toggleLabel.textContent = config.enabled ? 'ON' : 'OFF';
    await saveConfig();
    sendToContent({ type: 'toggle', enabled: config.enabled });
  });

  // Mode radio buttons
  modeRadios.forEach(radio => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      config.mode = radio.value;
      await saveConfig();
      if (config.enabled) {
        sendToContent({ type: 'updateConfig', config });
      }
    });
  });

  // Detection checkboxes
  detectionChecks.forEach(cb => {
    cb.addEventListener('change', async () => {
      config.detection[cb.dataset.detection] = cb.checked;
      await saveConfig();
      if (config.enabled) {
        sendToContent({ type: 'forceRescan' });
      }
    });
  });

  // Custom words
  toggleCustomBtn.addEventListener('click', () => {
    const open = !customEditor.classList.contains('hidden');
    if (open) {
      customEditor.classList.add('hidden');
      toggleCustomBtn.textContent = 'Edit';
    } else {
      customInput.value = (config.customWords || []).join('\n');
      customEditor.classList.remove('hidden');
      toggleCustomBtn.textContent = 'Close';
      customInput.focus();
    }
  });

  saveCustomBtn.addEventListener('click', async () => {
    const words = customInput.value
      .split('\n')
      .map(w => w.trim())
      .filter(Boolean);
    config.customWords = words;
    await saveConfig();
    renderCustomWordsPreview();
    customEditor.classList.add('hidden');
    toggleCustomBtn.textContent = 'Edit';
    if (config.enabled) sendToContent({ type: 'forceRescan' });
  });

  cancelCustomBtn.addEventListener('click', () => {
    customEditor.classList.add('hidden');
    toggleCustomBtn.textContent = 'Edit';
  });

  // Profiles
  profileSelect.addEventListener('change', () => {
    const name = profileSelect.value;
    if (name === '__current__') return;
    const profile = config.profiles[name];
    if (profile) {
      // Merge profile into current config (preserving profiles map)
      const profiles = config.profiles;
      config = { ...profile, profiles };
      renderAll();
      saveConfig();
      if (config.enabled) sendToContent({ type: 'forceRescan' });
    }
  });

  saveProfileBtn.addEventListener('click', async () => {
    const name = prompt('Profile name:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    config.profiles = config.profiles || {};
    // Save snapshot without the profiles map itself to avoid nesting
    const { profiles: _, ...snapshot } = config;
    config.profiles[trimmed] = snapshot;
    await saveConfig();
    renderProfiles();
    profileSelect.value = trimmed;
  });

  exportProfileBtn.addEventListener('click', () => {
    const { profiles: _, ...snapshot } = config;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'demo-shield-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  importProfileBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const raw = JSON.parse(e.target.result);
        const validated = validateImportedConfig(raw);
        const profiles = config.profiles || {};
        config = { ...validated, profiles };
        renderAll();
        await saveConfig();
        if (config.enabled) sendToContent({ type: 'forceRescan' });
      } catch (err) {
        alert('Invalid profile file: ' + err.message);
      }
    };
    reader.readAsText(file);
    importFileInput.value = '';
  });

  // Selector editor
  toggleSelectorsBtn.addEventListener('click', () => {
    const open = !selectorEditor.classList.contains('hidden');
    if (open) {
      selectorEditor.classList.add('hidden');
      toggleSelectorsBtn.textContent = 'Edit';
    } else {
      renderSelectors();
      selectorEditor.classList.remove('hidden');
      toggleSelectorsBtn.textContent = 'Close';
    }
  });

  saveSelectorsBtn.addEventListener('click', async () => {
    try {
      const rules = JSON.parse(selectorInput.value);
      validateSelectorRules(rules);
      config.selectorRules = rules;
      await saveConfig();
      selectorEditor.classList.add('hidden');
      toggleSelectorsBtn.textContent = 'Edit';
      if (config.enabled) sendToContent({ type: 'forceRescan' });
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  });

  cancelSelectorsBtn.addEventListener('click', () => {
    selectorEditor.classList.add('hidden');
    toggleSelectorsBtn.textContent = 'Edit';
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveConfig() {
  await chrome.storage.sync.set({ demoShieldConfig: config });
}

function sendToContent(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
  });
}

function pollStats() {
  const update = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'getStats' }, response => {
        if (chrome.runtime.lastError) return;
        if (response && typeof response.count === 'number') {
          const n = response.count;
          statCount.textContent = n > 0 ? `${n} item${n === 1 ? '' : 's'} redacted` : '';
        }
      });
    });
  };
  update();
  setInterval(update, 1500);
}

function getDefaultConfig() {
  return {
    enabled: false,
    mode: 'blackout',
    hoverReveal: false,
    detection: {
      names: true, ssn: true, phone: true, email: true,
      currency: true, dates: true, addresses: true,
      claimNumbers: true, medicalCodes: true, customWords: true,
    },
    customWords: [],
    selectorRules: [],
    profiles: {},
    stats: { totalRedacted: 0, lastUsed: null },
  };
}

// ─── Config validation ────────────────────────────────────────────────────────

const VALID_MODES = new Set(['blackout', 'replace', 'blur']);
const VALID_DETECTION_KEYS = new Set([
  'names', 'ssn', 'phone', 'email', 'currency',
  'dates', 'addresses', 'claimNumbers', 'medicalCodes', 'customWords',
]);
const VALID_SELECTOR_TYPES = new Set([
  'name', 'ssn', 'id', 'phone', 'email', 'address', 'currency',
  'claimNumbers', 'medicalCodes', 'customWord',
]);

/**
 * Validate and sanitize an imported config object.
 * Returns a clean config merged over the current defaults, or throws if the
 * object is structurally invalid.
 */
function validateImportedConfig(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config must be a JSON object.');
  }

  const allowed = new Set([
    'enabled', 'mode', 'hoverReveal', 'detection',
    'customWords', 'selectorRules', 'profiles', 'stats',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new Error(`Unexpected config key: "${key}"`);
  }

  if ('enabled' in raw && typeof raw.enabled !== 'boolean') {
    throw new Error('"enabled" must be true or false.');
  }
  if ('mode' in raw && !VALID_MODES.has(raw.mode)) {
    throw new Error(`"mode" must be one of: ${[...VALID_MODES].join(', ')}.`);
  }
  if ('hoverReveal' in raw && typeof raw.hoverReveal !== 'boolean') {
    throw new Error('"hoverReveal" must be true or false.');
  }

  if ('detection' in raw) {
    if (typeof raw.detection !== 'object' || raw.detection === null) {
      throw new Error('"detection" must be an object.');
    }
    for (const [k, v] of Object.entries(raw.detection)) {
      if (!VALID_DETECTION_KEYS.has(k)) throw new Error(`Unknown detection key: "${k}"`);
      if (typeof v !== 'boolean') throw new Error(`detection["${k}"] must be true or false.`);
    }
  }

  if ('customWords' in raw) {
    if (!Array.isArray(raw.customWords)) throw new Error('"customWords" must be an array.');
    for (const w of raw.customWords) {
      if (typeof w !== 'string') throw new Error('Each custom word must be a string.');
    }
  }

  if ('selectorRules' in raw) {
    validateSelectorRules(raw.selectorRules);
  }

  return raw;
}

/**
 * Validate an array of selector rules.
 * Each rule must have a string "selector" and a whitelisted "type".
 * The selector is also test-run against an empty div to catch invalid CSS.
 */
function validateSelectorRules(rules) {
  if (!Array.isArray(rules)) throw new Error('Selector rules must be an array.');
  const probe = document.createElement('div');
  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null) {
      throw new Error('Each selector rule must be an object.');
    }
    if (typeof rule.selector !== 'string' || !rule.selector.trim()) {
      throw new Error('Each selector rule must have a non-empty "selector" string.');
    }
    if (!VALID_SELECTOR_TYPES.has(rule.type)) {
      throw new Error(
        `Invalid selector rule type "${rule.type}". ` +
        `Allowed: ${[...VALID_SELECTOR_TYPES].join(', ')}.`
      );
    }
    try {
      probe.querySelector(rule.selector);
    } catch {
      throw new Error(`Invalid CSS selector: "${rule.selector}"`);
    }
  }
}
