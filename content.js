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

  function findMatches(rule, matched) {
    if (!rule.anchor) {
      for (const element of document.body.getElementsByTagName(rule.tag)) {
        if (matchesRule(element, rule)) matched.add(element);
      }
      return;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.nodeValue.includes(rule.anchor)) continue;
      for (let element = walker.currentNode.parentElement; element && element !== document.body; element = element.parentElement) {
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

  function markMatches() {
    const matched = new Set();
    for (const rule of textRules) findMatches(rule, matched);

    for (const element of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
      if (!matched.has(element)) element.removeAttribute(HIDDEN_ATTR);
    }
    for (const element of matched) {
      element.setAttribute(HIDDEN_ATTR, "");
    }
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
    markMatches();
  }

  function applyEnabled(enabled) {
    document.documentElement.classList.toggle(ENABLED_CLASS, enabled);
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      markMatches();
    });
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
