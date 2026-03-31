/**
 * detector.js — PII Detection Engine
 *
 * Three-layer detection pipeline:
 *   1. CSS Selector targeting (highest confidence, known UIs)
 *   2. Regex pattern matching (structured PII)
 *   3. NLP entity detection via compromise.js (unstructured names/places/orgs)
 *   + Custom word list
 *
 * Returns an array of Match objects:
 *   { node, startOffset, endOffset, type, original }
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const SKIP_TAGS = new Set([
  // Per spec: never process these
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE',
  // These have no text nodes — values are properties, not child nodes
  'TEXTAREA', 'INPUT', 'SELECT',
  // Head-level tags that are never visible
  'HEAD', 'META', 'LINK', 'TITLE',
]);

const DS_PROCESSED_ATTR = 'data-ds-processed';
const NLP_MIN_WORD_COUNT = 3;

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const REGEX_PATTERNS = {
  ssn: [
    { id: 'ssn',  re: /\b\d{3}-\d{2}-\d{4}\b/g },
    { id: 'fein', re: /\b\d{2}-\d{7}\b/g },
  ],
  phone: [
    { id: 'phone_us', re: /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  ],
  email: [
    { id: 'email', re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/gi },
  ],
  currency: [
    { id: 'currency', re: /\$\s?[\d,]+\.?\d{0,2}\b/g },
  ],
  dates: [
    { id: 'date_us',  re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g },
    { id: 'date_iso', re: /\b\d{4}-\d{2}-\d{2}\b/g },
  ],
  claimNumbers: [
    { id: 'claim_number',  re: /\b[A-Z]{2,4}-?\d{6,12}\b/g },
    { id: 'policy_number', re: /\b[A-Z]{2,5}\d{6,10}\b/g },
  ],
  addresses: [
    { id: 'zip_code',       re: /\b\d{5}(-\d{4})?\b/g },
    { id: 'street_address', re: /\b\d{1,5}\s[A-Z][a-z]+\s(St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Ter|Circle|Cir)\.?\b/gi },
  ],
  medicalCodes: [
    { id: 'icd10', re: /\b[A-Z]\d{2,3}\.?\d{0,4}\b/g },
  ],
};

// ─── DemoShieldDetector ───────────────────────────────────────────────────────

class DemoShieldDetector {
  constructor() {
    this.config = null;
    this.compiledCustomWords = null; // RegExp or null
    this._replacementCounters = {};
  }

  /** Update config and recompile custom-word pattern */
  updateConfig(config) {
    this.config = config;
    this._compileCustomWords();
  }

  _compileCustomWords() {
    const words = this.config?.customWords;
    if (!words || words.length === 0) {
      this.compiledCustomWords = null;
      return;
    }
    const escaped = words
      .map(w => w.trim())
      .filter(Boolean)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this.compiledCustomWords = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }

  // ── Layer 1: CSS Selector scan ──────────────────────────────────────────────

  /**
   * Returns elements (with their type) matching configured selector rules.
   * @returns {Array<{element: Element, type: string}>}
   */
  getSelectorMatches(root = document) {
    if (!this.config) return [];
    const rules = [
      ...(this.config.selectorRules || []),
    ];
    const results = [];
    for (const rule of rules) {
      try {
        const elements = root.querySelectorAll(rule.selector);
        elements.forEach(el => {
          if (!this._isVisible(el)) return;
          results.push({ element: el, type: rule.type });
        });
      } catch (_) {
        // invalid selector — skip
      }
    }
    return results;
  }

  // ── Layer 2 & 3: Text-node scan ─────────────────────────────────────────────

  /**
   * Scan a text node and return all detected matches.
   * @param {Text} textNode
   * @returns {Array<{startOffset, endOffset, type, original}>}
   */
  detectInTextNode(textNode) {
    const text = textNode.textContent;
    if (!text || text.trim().length === 0) return [];

    const detection = this.config?.detection || {};
    const allMatches = [];

    // Layer 2a: Custom word list (highest user-priority)
    if (detection.customWords && this.compiledCustomWords) {
      this._collectRegexMatches(text, this.compiledCustomWords, 'customWord', allMatches);
      this.compiledCustomWords.lastIndex = 0;
    }

    // Layer 2b: Regex patterns per category
    for (const [category, patterns] of Object.entries(REGEX_PATTERNS)) {
      if (!detection[category]) continue;
      for (const { re } of patterns) {
        const freshRe = new RegExp(re.source, re.flags);
        this._collectRegexMatches(text, freshRe, category, allMatches);
      }
    }

    // Layer 3: NLP (names/places/orgs) — only if compromise is available
    if (detection.names && typeof nlp !== 'undefined') {
      const wordCount = text.trim().split(/\s+/).length;
      if (wordCount >= NLP_MIN_WORD_COUNT) {
        this._collectNlpMatches(text, allMatches);
      }
    }

    // De-duplicate / resolve overlaps (longer wins, earlier wins on ties)
    return this._resolveOverlaps(allMatches);
  }

  /** Run a regex and push non-overlapping matches into collector */
  _collectRegexMatches(text, re, type, collector) {
    let m;
    while ((m = re.exec(text)) !== null) {
      collector.push({
        startOffset: m.index,
        endOffset: m.index + m[0].length,
        type,
        original: m[0],
      });
    }
  }

  /** Run compromise.js NLP and collect named-entity offsets */
  _collectNlpMatches(text, collector) {
    try {
      const doc = nlp(text);
      const entityGroups = [
        { method: 'people', type: 'names' },
        { method: 'places', type: 'addresses' },
        { method: 'organizations', type: 'names' },
      ];
      for (const { method, type } of entityGroups) {
        const terms = doc[method]().out('array');
        for (const term of terms) {
          if (!term || term.length < 2) continue;
          // Find all occurrences of this term in text
          const termRe = new RegExp(
            term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'gi'
          );
          let m;
          while ((m = termRe.exec(text)) !== null) {
            collector.push({
              startOffset: m.index,
              endOffset: m.index + m[0].length,
              type,
              original: m[0],
            });
          }
        }
      }
    } catch (_) {
      // NLP failure is non-fatal
    }
  }

  /**
   * Remove overlapping matches: when two ranges overlap, keep the one
   * that starts earlier (and is longer if same start).
   */
  _resolveOverlaps(matches) {
    if (matches.length === 0) return [];

    // Sort by start offset, then by length descending
    matches.sort((a, b) => {
      if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
      return (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset);
    });

    const resolved = [];
    let cursor = -1;
    for (const m of matches) {
      if (m.startOffset >= cursor) {
        resolved.push(m);
        cursor = m.endOffset;
      }
    }
    return resolved;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  /**
   * Walk all text nodes under a root element, skipping excluded tags
   * and already-processed nodes.
   * @param {Element} root
   * @param {boolean} skipProcessed
   * @returns {Text[]}
   */
  collectTextNodes(root, skipProcessed = true) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          // Skip nodes inside demo-shield redaction wrappers
          if (parent.closest('[data-ds-redacted]')) return NodeFilter.FILTER_REJECT;
          if (skipProcessed && parent.hasAttribute(DS_PROCESSED_ATTR)) {
            return NodeFilter.FILTER_SKIP;
          }
          if (!node.textContent || node.textContent.trim() === '') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    return nodes;
  }
}

// Export as global (content script context)
window.DemoShieldDetector = DemoShieldDetector;
