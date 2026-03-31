/**
 * service-worker.js — Background Service Worker
 *
 * Responsibilities:
 *  - Initialize default config on install
 *  - Route messages between popup and content scripts
 *  - Manage badge text (redaction count)
 *  - Handle keyboard command shortcuts
 */

'use strict';

// ─── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  enabled: false,
  mode: 'blackout',
  hoverReveal: false,
  detection: {
    names: true,
    ssn: true,
    phone: true,
    email: true,
    currency: true,
    dates: true,
    addresses: true,
    claimNumbers: true,
    medicalCodes: true,
    customWords: true,
  },
  customWords: [],
  selectorRules: [
    { selector: "[data-field='claimant_name']", type: 'name' },
    { selector: "[data-field='insured_name']",  type: 'name' },
    { selector: "[data-field='adjuster']",       type: 'name' },
    { selector: "[data-field='attorney']",       type: 'name' },
    { selector: "[data-field='provider']",       type: 'name' },
    { selector: "[data-field='ssn']",            type: 'ssn'  },
    { selector: "[data-field='policy_number']",  type: 'id'   },
    { selector: "[data-field='claim_number']",   type: 'id'   },
    { selector: "[data-field='phone']",          type: 'phone'},
    { selector: "[data-field='email']",          type: 'email'},
    { selector: "[data-field='address']",        type: 'address'},
    { selector: '.adjuster-name',                type: 'name' },
    { selector: '.policy-number',                type: 'id'   },
    { selector: '.reserve-amount',               type: 'currency'},
    { selector: '.payment-amount',               type: 'currency'},
    { selector: '.settlement-value',             type: 'currency'},
  ],
  profiles: {},
  stats: {
    totalRedacted: 0,
    lastUsed: null,
  },
};

// ─── Install / Update ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({ demoShieldConfig: DEFAULT_CONFIG });
    console.log('[Demo Shield] Installed with default config.');
  }
});

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reject messages from any context that isn't this extension.
  if (sender.id !== chrome.runtime.id) return;

  switch (message.type) {
    case 'updateBadge':
      handleBadgeUpdate(message.count, sender.tab?.id);
      sendResponse({ ok: true });
      break;

    case 'getConfig':
      chrome.storage.sync.get(['demoShieldConfig'], result => {
        sendResponse({ config: result.demoShieldConfig || DEFAULT_CONFIG });
      });
      return true; // async

    case 'saveConfig':
      saveConfig(message.config).then(() => {
        broadcastToActiveTab({ type: 'updateConfig', config: message.config });
        sendResponse({ ok: true });
      });
      return true;

    case 'toggle': {
      // Toggle enabled state, save, and forward to content script
      chrome.storage.sync.get(['demoShieldConfig'], async result => {
        const cfg = result.demoShieldConfig || DEFAULT_CONFIG;
        cfg.enabled = message.enabled;
        if (cfg.enabled) {
          cfg.stats.lastUsed = new Date().toISOString();
        }
        await chrome.storage.sync.set({ demoShieldConfig: cfg });
        await broadcastToActiveTab({ type: 'toggle', enabled: cfg.enabled });
        updateActionBadge(cfg.enabled, sender.tab?.id);
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'forceRescan':
      broadcastToActiveTab({ type: 'forceRescan' });
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false });
  }
});

// ─── Keyboard Commands ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const result = await chrome.storage.sync.get(['demoShieldConfig']);
  const cfg = result.demoShieldConfig || DEFAULT_CONFIG;

  if (command === 'toggle-redaction') {
    cfg.enabled = !cfg.enabled;
    if (cfg.enabled) cfg.stats.lastUsed = new Date().toISOString();
    await chrome.storage.sync.set({ demoShieldConfig: cfg });
    chrome.tabs.sendMessage(tab.id, { type: 'toggle', enabled: cfg.enabled }).catch(() => {});
    updateActionBadge(cfg.enabled, tab.id);
  }

  if (command === 'cycle-mode') {
    const modes = ['blackout', 'replace', 'blur'];
    const current = modes.indexOf(cfg.mode);
    cfg.mode = modes[(current + 1) % modes.length];
    await chrome.storage.sync.set({ demoShieldConfig: cfg });
    chrome.tabs.sendMessage(tab.id, { type: 'updateConfig', config: cfg }).catch(() => {});
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveConfig(newConfig) {
  await chrome.storage.sync.set({ demoShieldConfig: newConfig });
}

async function broadcastToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, message).catch(() => {});
}

function handleBadgeUpdate(count, tabId) {
  if (!tabId) return;
  const text = count > 0 ? String(count > 999 ? '999+' : count) : '';
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: '#d93025', tabId }).catch(() => {});
}

function updateActionBadge(enabled, tabId) {
  if (!tabId) return;
  if (!enabled) {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
}
