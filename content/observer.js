/**
 * observer.js — MutationObserver Wrapper
 *
 * Watches for DOM changes (SPA navigation, AJAX content, React/Vue re-renders)
 * and queues newly added nodes for redaction scanning.
 *
 * Uses a 100ms debounce to batch rapid mutations (e.g., table renders).
 */

'use strict';

const OBSERVER_DEBOUNCE_MS = 100;

class DemoShieldObserver {
  /**
   * @param {function(Node[]): void} onNewNodes - callback with added nodes to scan
   */
  constructor(onNewNodes) {
    this._onNewNodes = onNewNodes;
    this._observer = null;
    this._debounceTimer = null;
    this._pendingNodes = new Set();
    this._active = false;
  }

  start() {
    if (this._active) return;
    this._active = true;

    this._observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.addedNodes) {
          // Skip text-only additions that are just whitespace
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent && node.textContent.trim()) {
              // Re-queue the parent for scanning
              if (node.parentElement) this._pendingNodes.add(node.parentElement);
            }
            continue;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            this._pendingNodes.add(node);
          }
        }
      }
      this._scheduleFlush();
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop() {
    if (!this._active) return;
    this._active = false;

    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._pendingNodes.clear();
  }

  _scheduleFlush() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._flush(), OBSERVER_DEBOUNCE_MS);
  }

  _flush() {
    if (this._pendingNodes.size === 0) return;
    const nodes = Array.from(this._pendingNodes);
    this._pendingNodes.clear();

    // Filter out nodes that are no longer in the DOM
    const liveNodes = nodes.filter(n => document.contains(n));
    if (liveNodes.length > 0) {
      this._onNewNodes(liveNodes);
    }
  }
}

window.DemoShieldObserver = DemoShieldObserver;
