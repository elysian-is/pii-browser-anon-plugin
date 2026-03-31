/**
 * content.js — Main Orchestrator
 *
 * Coordinates the detector, redactor, and observer.
 * Listens for messages from the background service worker.
 * Manages enable/disable lifecycle and config updates.
 */

'use strict';

// ─── Extension Context Guard ──────────────────────────────────────────────────
// When the extension is reloaded/updated, Chrome invalidates the old content
// script's context. ANY chrome.* call (or even unrelated code running in a
// callback originally registered via chrome.*) can throw at that point. We
// use a single try/catch wrapper around every deferred entry point so nothing
// escapes as "Uncaught Error" and crashes the host page.

let _contextDead = false; // sticky flag — once dead, stay dead

function isContextValid() {
  if (_contextDead) return false;
  try {
    if (!chrome.runtime?.id) {
      _contextDead = true;
      return false;
    }
    return true;
  } catch (_) {
    _contextDead = true;
    return false;
  }
}

function teardown() {
  _contextDead = true;
  enabled = false;
  try { observer.stop(); } catch (_) {}
  try { document.removeEventListener('copy', handleCopy, true); } catch (_) {}
}

function safeRun(fn) {
  if (_contextDead) return;
  try {
    fn();
  } catch (err) {
    if (err?.message?.includes('Extension context invalidated')) {
      teardown();
    }
    // Swallow all errors — content script bugs must never crash the host page.
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let config = null;
let enabled = false;

const detector = new window.DemoShieldDetector();
const redactor = new window.DemoShieldRedactor();
const observer = new window.DemoShieldObserver(handleNewNodes);

let _scanScheduled = false;

// ─── Initialization ───────────────────────────────────────────────────────────

// Load config from storage and start if already enabled
try {
  chrome.storage.sync.get(['demoShieldConfig'], result => {
    safeRun(() => {
      const stored = result.demoShieldConfig;
      if (stored) {
        config = stored;
        if (config.enabled) {
          enable();
        }
      }
    });
  });
} catch (_) {
  _contextDead = true;
}

// Listen for storage changes (from popup or another tab)
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    safeRun(() => {
      if (area !== 'sync' || !changes.demoShieldConfig) return;
      const newConfig = changes.demoShieldConfig.newValue;
      if (!newConfig) return;

      const wasEnabled = enabled;
      config = newConfig;
      detector.updateConfig(config);
      redactor.updateConfig(config);

      if (config.enabled && !wasEnabled) {
        enable();
      } else if (!config.enabled && wasEnabled) {
        disable();
      } else if (config.enabled && wasEnabled) {
        redactor.reRenderMode(config.mode, config.hoverReveal);
        scheduleFullScan();
      }
    });
  });
} catch (_) {
  _contextDead = true;
}

// Listen for direct messages from background/popup
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Reject messages from any context that isn't this extension.
    if (sender.id !== chrome.runtime.id) return;
    safeRun(() => {
      switch (message.type) {
        case 'toggle':
          if (message.enabled) enable();
          else disable();
          sendResponse({ ok: true });
          break;

        case 'updateConfig':
          if (message.config) {
            config = { ...config, ...message.config };
            detector.updateConfig(config);
            redactor.updateConfig(config);
            if (enabled) {
              redactor.reRenderMode(config.mode, config.hoverReveal);
              scheduleFullScan();
            }
          }
          sendResponse({ ok: true });
          break;

        case 'getStats':
          sendResponse({ count: redactor.redactionCount });
          break;

        case 'forceRescan':
          if (enabled) {
            redactor.removeAll();
            scheduleFullScan();
          }
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    });
    return true;
  });
} catch (_) {
  _contextDead = true;
}

// ─── Enable / Disable ─────────────────────────────────────────────────────────

function enable() {
  if (enabled) return;
  enabled = true;

  detector.updateConfig(config);
  redactor.updateConfig(config);

  document.addEventListener('copy', handleCopy, true);
  observer.start();
  scheduleFullScan();
}

function disable() {
  if (!enabled) return;
  enabled = false;

  observer.stop();
  document.removeEventListener('copy', handleCopy, true);
  redactor.removeAll();
  updateBadge(0);
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

function scheduleFullScan() {
  if (_scanScheduled) return;
  _scanScheduled = true;

  const run = () => safeRun(() => {
    _scanScheduled = false;
    scanRoot(document.body);
    updateBadge(redactor.redactionCount);
  });

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 500 });
  } else {
    setTimeout(run, 0);
  }
}

/**
 * Scan a root element:
 *   1. CSS selector rules → redact whole elements
 *   2. Walk text nodes → run detection + redact
 */
function scanRoot(root) {
  if (!root || !enabled) return;

  // Layer 1: selector-targeted elements
  const selectorMatches = detector.getSelectorMatches(root);
  for (const { element, type } of selectorMatches) {
    redactor.redactElement(element, type);
  }

  // Layer 2+3: text node scan
  const textNodes = detector.collectTextNodes(root, true);
  for (const textNode of textNodes) {
    const matches = detector.detectInTextNode(textNode);
    if (matches.length > 0) {
      redactor.redactTextNode(textNode, matches);
    } else {
      const parent = textNode.parentElement;
      if (parent && !parent.hasAttribute('data-ds-processed')) {
        parent.setAttribute('data-ds-processed', '1');
      }
    }
  }
}

/** Handle newly added DOM nodes (from MutationObserver) */
function handleNewNodes(nodes) {
  safeRun(() => {
    if (!isContextValid()) {
      teardown();
      return;
    }
    if (!enabled) return;
    for (const node of nodes) {
      if (node.hasAttribute && node.hasAttribute('data-ds-redacted')) continue;
      scanRoot(node);
    }
    updateBadge(redactor.redactionCount);
  });
}

// ─── Copy Interception ────────────────────────────────────────────────────────

function handleCopy(event) {
  if (!enabled) return;
  redactor.handleCopy(event);
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function updateBadge(count) {
  try {
    if (!isContextValid()) return;
    chrome.runtime.sendMessage({
      type: 'updateBadge',
      count,
      tabId: null,
    }).catch(() => {});
  } catch (_) {
    _contextDead = true;
  }
}
