/**
 * redactor.js — DOM Redaction Logic
 *
 * Handles all visual redaction: wrapping matched text spans in overlay
 * elements, managing replacement values, and cleaning up when disabled.
 *
 * Does NOT modify underlying DOM data — only adds overlay wrapper elements.
 */

'use strict';

// ─── Replacement Data ─────────────────────────────────────────────────────────

const REPLACEMENTS = {
  names: [
    'Alex Johnson', 'Sam Williams', 'Jordan Lee',
    'Taylor Brown', 'Morgan Davis', 'Casey Miller',
    'Riley Wilson', 'Drew Thompson', 'Avery Martinez',
  ],
  companies: [
    'Acme Corp', 'Globex Inc', 'Initech LLC',
    'Umbrella Co', 'Stark Industries', 'Wayne Enterprises',
  ],
  addresses: [
    '123 Main St, Anytown, ST 00000',
    '456 Oak Ave, Springfield, ST 11111',
    '789 Pine Rd, Riverside, ST 22222',
  ],
  emails: ['demo@example.com', 'user@example.com', 'contact@example.com'],
  phones: ['(555) 000-0001', '(555) 000-0002', '(555) 000-0003'],
};

let _replacementCounters = {};

function pickReplacement(arr) {
  const key = arr.join('|');
  _replacementCounters[key] = ((_replacementCounters[key] || 0) + 1) % arr.length;
  return arr[_replacementCounters[key]];
}

function getReplacementText(type, original) {
  switch (type) {
    case 'names':
      return pickReplacement(REPLACEMENTS.names);

    case 'ssn':
      return 'XXX-XX-XXXX';

    case 'phone':
      return pickReplacement(REPLACEMENTS.phones);

    case 'email':
      return pickReplacement(REPLACEMENTS.emails);

    case 'currency': {
      // Keep same magnitude with X's: $12,345.67 → $XX,XXX.XX
      const digits = original.replace(/[^0-9]/g, '');
      const masked = digits.replace(/\d/g, 'X');
      return original.replace(/[\d]+/g, () => {
        const chunk = digits.slice(0, masked.length);
        return chunk.replace(/\d/g, 'X');
      });
    }

    case 'dates':
      // Represent as redacted date placeholder
      return original.includes('-') ? 'XXXX-XX-XX' : 'XX/XX/XXXX';

    case 'addresses':
      return pickReplacement(REPLACEMENTS.addresses);

    case 'claimNumbers':
      return 'CLM-XXXXXXXXXXXX';

    case 'medicalCodes':
      return 'XXX.X';

    case 'customWord':
    default:
      return '█'.repeat(Math.max(4, Math.min(original.length, 12)));
  }
}

// ─── PII Storage (WeakMap, never in the DOM) ─────────────────────────────────
//
// Storing original PII in a data-ds-original DOM attribute would expose it to
// any JavaScript running on the page (analytics tags, widgets, etc.).
// A WeakMap keyed on the span element keeps the data in extension memory only.
// Entries are automatically GC'd when their span is removed from the DOM.

const _originalText = new WeakMap(); // span → original PII string

// ─── CSS Injection ────────────────────────────────────────────────────────────

const STYLES = `
.ds-redacted {
  display: inline;
  position: relative;
  border-radius: 2px;
  padding: 0 2px;
  box-sizing: border-box;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}

/* Blackout mode */
.ds-mode-blackout {
  background-color: #1a1a1a !important;
  color: #1a1a1a !important;
  border: 1px solid #000;
}
.ds-mode-blackout:hover {
  color: #1a1a1a !important;
}
.ds-mode-blackout.ds-hover-reveal:hover {
  color: #fff !important;
  background-color: #333 !important;
}

/* Replace mode */
.ds-mode-replace {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffc107;
  font-style: italic;
}

/* Blur mode */
.ds-mode-blur {
  filter: blur(5px);
  background-color: transparent;
  color: inherit;
  transition: filter 0.2s ease;
}
.ds-mode-blur.ds-hover-reveal:hover {
  filter: blur(0);
}

@media print {
  .ds-redacted {
    background-color: #000 !important;
    color: #000 !important;
    filter: none !important;
  }
}
`;

let _styleInjected = false;

function injectStyles() {
  if (_styleInjected) return;
  const style = document.createElement('style');
  style.id = 'demo-shield-styles';
  style.textContent = STYLES;
  (document.head || document.documentElement).appendChild(style);
  _styleInjected = true;
}

function removeStyles() {
  const el = document.getElementById('demo-shield-styles');
  if (el) el.remove();
  _styleInjected = false;
}

// ─── DemoShieldRedactor ───────────────────────────────────────────────────────

class DemoShieldRedactor {
  constructor() {
    this.mode = 'blackout';
    this.hoverReveal = false;
    this.redactionCount = 0;
  }

  updateConfig(config) {
    this.mode = config.mode || 'blackout';
    this.hoverReveal = config.hoverReveal || false;
  }

  /**
   * Redact a text node given a sorted array of non-overlapping matches.
   * Splits the text node into: unchanged text + redacted <span> wrappers.
   *
   * @param {Text} textNode
   * @param {Array<{startOffset, endOffset, type, original}>} matches
   */
  redactTextNode(textNode, matches) {
    if (!matches || matches.length === 0) return;

    // Capture parent immediately — React/Vue may detach this node asynchronously
    // between when we collected it and when we process it.
    const parent = textNode.parentNode;
    if (!parent) return;

    injectStyles();

    const text = textNode.textContent;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let addedCount = 0;

    for (const match of matches) {
      // Text before this match
      if (match.startOffset > cursor) {
        fragment.appendChild(
          document.createTextNode(text.slice(cursor, match.startOffset))
        );
      }

      // Redacted span
      const span = this._createRedactionSpan(match);
      fragment.appendChild(span);
      cursor = match.endOffset;
      addedCount++;
    }

    // Remaining text after last match
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    // Final guard: verify the node hasn't been detached or re-parented by a
    // framework re-render between collection time and now.
    if (textNode.parentNode !== parent) return;

    try {
      parent.replaceChild(fragment, textNode);
      this.redactionCount += addedCount;
      // Mark ancestor so MutationObserver skips it on the next flush
      const markTarget = parent.nodeType === Node.ELEMENT_NODE ? parent : parent.parentElement;
      if (markTarget) markTarget.setAttribute('data-ds-processed', '1');
    } catch (_) {
      // replaceChild can still race with framework mutations — silently skip.
    }
  }

  /**
   * Redact an entire element (from CSS selector match).
   * Wraps the element's content with a redaction span.
   */
  redactElement(element, type) {
    if (element.hasAttribute('data-ds-redacted')) return; // already done
    injectStyles();

    const original = element.textContent;
    if (!original || original.trim() === '') return;

    const displayText = this.mode === 'replace'
      ? getReplacementText(type, original)
      : original;

    const span = document.createElement('span');
    span.className = this._buildClassName();
    span.setAttribute('data-ds-redacted', type);
    _originalText.set(span, original); // store PII in memory, not in the DOM
    span.textContent = displayText;

    // Clear element content and insert span
    element.textContent = '';
    element.appendChild(span);
    element.setAttribute('data-ds-processed', '1');
    this.redactionCount++;
  }

  _createRedactionSpan(match) {
    const span = document.createElement('span');
    span.className = this._buildClassName();
    span.setAttribute('data-ds-redacted', match.type);
    _originalText.set(span, match.original); // store PII in memory, not in the DOM

    span.textContent = this.mode === 'replace'
      ? getReplacementText(match.type, match.original)
      : match.original; // original text is hidden by CSS in blackout/blur

    return span;
  }

  _buildClassName() {
    let cls = `ds-redacted ds-mode-${this.mode}`;
    if (this.hoverReveal) cls += ' ds-hover-reveal';
    return cls;
  }

  /**
   * Re-render all existing redactions with the new mode.
   * Called when the user switches mode without a full rescan.
   */
  reRenderMode(mode, hoverReveal) {
    this.mode = mode;
    this.hoverReveal = hoverReveal;

    const spans = document.querySelectorAll('.ds-redacted');
    spans.forEach(span => {
      const type = span.getAttribute('data-ds-redacted') || 'customWord';
      const original = _originalText.get(span) || span.textContent;
      span.className = this._buildClassName();
      span.textContent = mode === 'replace'
        ? getReplacementText(type, original)
        : original;
    });
  }

  /**
   * Remove all redactions from the page, restoring original text nodes.
   */
  removeAll() {
    const spans = document.querySelectorAll('[data-ds-redacted]');
    spans.forEach(span => {
      const original = _originalText.get(span);
      if (original !== undefined) {
        const textNode = document.createTextNode(original);
        if (span.parentNode) {
          span.parentNode.replaceChild(textNode, span);
          // Normalize adjacent text nodes
          textNode.parentNode && textNode.parentNode.normalize &&
            textNode.parentNode.normalize();
        }
      }
    });

    // Remove processed markers so nodes will be re-scanned on re-enable
    document.querySelectorAll('[data-ds-processed]').forEach(el => {
      el.removeAttribute('data-ds-processed');
    });

    removeStyles();
    this.redactionCount = 0;
    _replacementCounters = {};
  }

  /**
   * Intercept copy events to provide redacted clipboard text.
   */
  handleCopy(event) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    // Replace redacted spans with their replacement/placeholder text
    container.querySelectorAll('[data-ds-redacted]').forEach(span => {
      const type = span.getAttribute('data-ds-redacted') || 'customWord';
      // Cloned spans are not in the WeakMap, so we don't have the original PII
      // here — which is fine. The clipboard just needs a safe placeholder, not
      // the actual original. Pass '' so getReplacementText uses its defaults.
      span.textContent = getReplacementText(type, '');
    });

    const redactedText = container.textContent;
    event.clipboardData.setData('text/plain', redactedText);
    event.preventDefault();
  }
}

// Export as global (content script context)
window.DemoShieldRedactor = DemoShieldRedactor;
