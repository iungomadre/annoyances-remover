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

  // Climbs from the text node containing the rule's anchor to the rank-th
  // ancestor with the picked element's tag and full text.
  function findRuleElement(element, rule) {
    let rank = 0;
    for (; element && element !== document.body; element = element.parentElement) {
      const text = normalizeText(element.textContent);
      if (text.length > rule.text.length) return null;
      if (text !== rule.text || element.localName !== rule.tag) continue;
      if (rank === rule.rank) return element;
      rank++;
    }
    return null;
  }

  function markMatches() {
    const matched = new Set();
    if (textRules.length) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        for (const rule of textRules) {
          if (!textNode.nodeValue.includes(rule.anchor)) continue;
          const element = findRuleElement(textNode.parentElement, rule);
          if (element) matched.add(element);
        }
      }
    }

    for (const element of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
      if (!matched.has(element)) element.removeAttribute(HIDDEN_ATTR);
    }
    for (const element of matched) {
      element.setAttribute(HIDDEN_ATTR, "");
    }
  }

  function applyRules(rules) {
    textRules = rules.filter((rule) => rule.type === "text");
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
