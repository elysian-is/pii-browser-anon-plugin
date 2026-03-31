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
        const imported = JSON.parse(e.target.result);
        const profiles = config.profiles || {};
        config = { ...imported, profiles };
        renderAll();
        await saveConfig();
        if (config.enabled) sendToContent({ type: 'forceRescan' });
      } catch {
        alert('Invalid profile file. Expected JSON.');
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
      if (!Array.isArray(rules)) throw new Error('Must be an array');
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
