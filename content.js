// Injected both by the registered content script and on demand by the popup,
// so it must only start once per page.
(() => {
  if (globalThis.pageHiderLoaded) return;
  globalThis.pageHiderLoaded = true;

  const HIDDEN_ATTR = "data-page-hider-hidden";
  const ENABLED_CLASS = "page-hider-enabled";
  const host = location.hostname;

  // visibility (not display: none) keeps hidden elements laid out and animating, so
  // the page's own show/hide logic still works and they can be revealed again intact.
  const baseStyle = document.createElement("style");
  baseStyle.textContent = `
    html.${ENABLED_CLASS} [${HIDDEN_ATTR}],
    html.${ENABLED_CLASS} [${HIDDEN_ATTR}] * {
      visibility: hidden !important;
    }
  `;
  const selectorStyle = document.createElement("style");
  document.head.append(baseStyle, selectorStyle);

  let textRules = [];
  const marked = new Set();

  function prefixLength(pattern) {
    const wildcard = pattern.indexOf(null);
    return wildcard === -1 ? pattern.length : wildcard;
  }

  // Checks the cheap fixed prefix first, so most candidates are rejected after
  // a few tokens instead of a full walk.
  function matchesRule(element, rule) {
    if (element.localName !== rule.tag) return false;
    const prefix = prefixLength(rule.pattern);
    const head = tokenize(element, prefix);
    for (let i = 0; i < prefix; i++) {
      if (head[i] !== rule.pattern[i]) return false;
    }
    const tokens = tokenize(element, rule.maxTokens);
    return tokens.length <= rule.maxTokens && matchesPattern(tokens, rule.pattern);
  }

  function matchesAnyRule(element) {
    return textRules.some((rule) => matchesRule(element, rule));
  }

  // A change inside an element can only affect whether it or its ancestors match.
  function checkAncestors(node, matched) {
    const start = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    for (const rule of textRules) {
      for (let element = start; element && element !== document.body; element = element.parentElement) {
        if (element.localName !== rule.tag) continue;
        // Ancestors only get bigger, so once one is too large none will match.
        if (tokenize(element, rule.maxTokens).length > rule.maxTokens) break;
        if (matchesRule(element, rule)) {
          matched.add(element);
          break;
        }
      }
    }
  }

  // Finds matches anywhere inside newly added content (or the whole page).
  function checkSubtree(root, matched) {
    for (const rule of textRules) {
      if (!rule.anchor) {
        for (const element of root.getElementsByTagName(rule.tag)) {
          if (matchesRule(element, rule)) matched.add(element);
        }
        continue;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.nodeValue.includes(rule.anchor)) checkAncestors(walker.currentNode, matched);
      }
    }
  }

  function mark(matched) {
    for (const element of marked) {
      if (!element.isConnected || (!matched.has(element) && !matchesAnyRule(element))) {
        element.removeAttribute(HIDDEN_ATTR);
        marked.delete(element);
      }
    }
    for (const element of matched) {
      element.setAttribute(HIDDEN_ATTR, "");
      marked.add(element);
    }
  }

  function checkPage() {
    const matched = new Set();
    checkSubtree(document.body, matched);
    for (const element of marked) {
      if (!matched.has(element)) element.removeAttribute(HIDDEN_ATTR);
    }
    marked.clear();
    mark(matched);
  }

  // Only what changed is re-checked: pages like Meet update constantly, and
  // rescanning everything on each update keeps the page (and the popup) busy.
  function checkChanges(records) {
    const matched = new Set();
    const changed = new Set();
    for (const record of records) {
      changed.add(record.target);
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) checkSubtree(node, matched);
      }
    }
    for (const node of changed) {
      if (node.isConnected) checkAncestors(node, matched);
    }
    mark(matched);
  }

  function applyRules(rules) {
    // Text picks saved before patterns existed have no pattern and are skipped.
    textRules = rules.filter((rule) => rule.type === "text" && rule.pattern);
    // One CSS rule per selector, so a single invalid selector can't void the rest.
    selectorStyle.textContent = rules
      .filter((rule) => rule.type === "selector")
      .map(
        (rule) =>
          `html.${ENABLED_CLASS} ${rule.selector}, html.${ENABLED_CLASS} ${rule.selector} * { visibility: hidden !important; }`,
      )
      .join("\n");
    checkPage();
  }

  function applyEnabled(enabled) {
    document.documentElement.classList.toggle(ENABLED_CLASS, enabled);
  }

  let pending = [];
  new MutationObserver((records) => {
    if (!textRules.length) return;
    if (!pending.length) {
      requestAnimationFrame(() => {
        const records = pending;
        pending = [];
        checkChanges(records);
      });
    }
    pending.push(...records);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  loadSettings().then((settings) => applyEnabled(settings.enabled));
  loadRules(host).then(applyRules);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && "enabled" in changes) {
      applyEnabled(changes.enabled.newValue);
    }
    const key = rulesKey(host);
    if (area === "local" && key in changes) {
      applyRules(changes[key].newValue ?? []);
    }
  });
})();
