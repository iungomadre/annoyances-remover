// Injected by the popup each time "Pick element" is clicked. When the popup sets
// pageHiderRefineId, the pick is merged into that existing rule instead.
// pageHiderAutoApply tells it whether picks apply on every visit to this site.
(() => {
  if (globalThis.pageHiderPicking) return;
  globalThis.pageHiderPicking = true;

  const host = location.hostname;
  const refineId = globalThis.pageHiderRefineId;
  const autoApply = globalThis.pageHiderAutoApply;

  // The overlay lives in a shadow root so page styles can't reach it, and ignores
  // the pointer so hovering always targets the page underneath.
  const overlayHost = document.createElement("div");
  overlayHost.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  const shadow = overlayHost.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .box {
        position: fixed;
        border: 2px solid #1a73e8;
        background: rgb(26 115 232 / 0.15);
        border-radius: 2px;
        box-sizing: border-box;
        display: none;
      }
      .bar {
        position: fixed;
        left: 50%;
        top: 12px;
        transform: translateX(-50%);
        max-width: min(560px, calc(100vw - 32px));
        padding: 8px 12px;
        border-radius: 8px;
        background: #202124;
        color: #e8eaed;
        font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
      }
      .target {
        color: #8ab4f8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .keys {
        color: #9aa0a6;
        font-size: 12px;
      }
      .error {
        color: #f28b82;
      }
    </style>
    <div class="box"></div>
    <div class="bar">
      <div class="target"></div>
      <div class="keys">Click to hide · ↑ select parent · ↓ select child · Esc to cancel</div>
    </div>
  `;
  const box = shadow.querySelector(".box");
  const targetLabel = shadow.querySelector(".target");
  const prompt = refineId
    ? "Pick the same thing again. Parts that differ from the first pick will be ignored"
    : "Hover over the part of the page to hide";
  targetLabel.textContent = prompt;
  document.documentElement.append(overlayHost);

  let hovered = null;
  let selected = null;

  // Elements without words, or too large to compare, are matched by position.
  function canMatchByPattern(tokens) {
    return tokens.length <= MAX_TOKENS && tokens.some(isWord);
  }

  function describe(element) {
    const tokens = tokenize(element, MAX_TOKENS);
    if (canMatchByPattern(tokens)) return describePattern(tokens);
    const reason = tokens.length > MAX_TOKENS ? "too large" : "no text";
    return `<${element.localName}> (${reason}, matched by position on the page)`;
  }

  function select(element) {
    selected = element;
    const rect = element.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    targetLabel.textContent = describe(element);
    targetLabel.classList.remove("error");
  }

  // Ids and aria-labels survive better than position, so they're used where present.
  // Ids with digits are skipped as they're usually generated per page load.
  function buildSelector(element) {
    const steps = [];
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      if (node.id && !/\d/.test(node.id)) {
        steps.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let step = node.localName;
      const label = node.getAttribute("aria-label");
      if (label) step += `[aria-label="${CSS.escape(label)}"]`;
      const sameTag = [...(node.parentElement?.children ?? [])].filter((child) => child.localName === node.localName);
      if (sameTag.length > 1) step += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      steps.unshift(step);
    }
    return steps.join(" > ");
  }

  function buildRule(element) {
    const base = { id: crypto.randomUUID(), label: describe(element) };
    const tokens = tokenize(element, MAX_TOKENS);
    if (canMatchByPattern(tokens)) {
      return { ...base, type: "text", tag: element.localName, ...patternFields(tokens, tokens.length) };
    }
    return { ...base, type: "selector", selector: buildSelector(element) };
  }

  // Leaves headroom over the largest pick seen, since the parts that differ can grow.
  function patternFields(pattern, longest) {
    return { pattern, anchor: patternAnchor(pattern), maxTokens: longest * 2, label: describePattern(pattern) };
  }

  function isSameRule(a, b) {
    return a.type === b.type && (a.type === "text" ? JSON.stringify(a.pattern) === JSON.stringify(b.pattern) : a.selector === b.selector);
  }

  async function pick(element) {
    const rule = buildRule(element);
    const rules = await loadRules(host);
    if (!rules.some((existing) => isSameRule(existing, rule))) {
      await saveRules(host, [...rules, rule]);
    }
    return null;
  }

  // Returns an error message to show instead of finishing, or null when saved.
  async function refine(element) {
    const rules = await loadRules(host);
    const rule = rules.find((existing) => existing.id === refineId);
    if (!rule) return null;
    if (element.localName !== rule.tag) {
      return `That's a <${element.localName}>, but the first pick was a <${rule.tag}>. Use ↑ / ↓ to pick the same level`;
    }
    const tokens = tokenize(element, MAX_TOKENS);
    if (tokens.length > MAX_TOKENS) return "That's too large to compare. Use ↓ to narrow the selection";
    const pattern = mergePatterns(rule.pattern, tokens);
    if (!isSpecificEnough(pattern)) {
      return "That has too little in common with the first pick to hide safely. Try a wider selection";
    }
    const longest = Math.max(rule.maxTokens / 2, tokens.length);
    const refined = { ...rule, ...patternFields(pattern, longest) };
    await saveRules(host, rules.map((existing) => (existing.id === refineId ? refined : existing)));
    return null;
  }

  function showError(message) {
    targetLabel.textContent = message;
    targetLabel.classList.add("error");
  }

  function stopListening() {
    globalThis.pageHiderPicking = false;
    for (const [type, handler] of listeners) window.removeEventListener(type, handler, true);
  }

  function stop() {
    stopListening();
    overlayHost.remove();
  }

  // Turns hiding on (a pick should take effect even if it was switched off) and
  // tells the user where the pick will apply, since that's easy to forget.
  async function finish() {
    stopListening();
    await chrome.storage.sync.set({ enabled: true });
    box.style.display = "none";
    targetLabel.style.whiteSpace = "normal";
    targetLabel.textContent = autoApply
      ? `Hidden. This will be hidden every time you visit ${host}`
      : `Hidden. This will be hidden again whenever you open Annoyance Remover on ${host}`;
    shadow.querySelector(".keys").textContent = autoApply
      ? "Change or undo this from the extension icon in the toolbar"
      : 'To hide it on every visit, turn on "Apply on every visit" from the extension icon in the toolbar';
    setTimeout(() => overlayHost.remove(), 6000);
  }

  function swallow(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  const listeners = [
    ["mousemove", (event) => {
      if (event.target === hovered) return;
      hovered = event.target;
      if (hovered !== document.documentElement && hovered !== document.body) select(hovered);
    }],
    ["click", async (event) => {
      swallow(event);
      if (!selected) return stop();
      const error = await (refineId ? refine(selected) : pick(selected));
      if (error) showError(error);
      else finish();
    }],
    ["keydown", (event) => {
      if (event.key === "Escape") {
        swallow(event);
        stop();
      } else if (event.key === "ArrowUp" && selected) {
        swallow(event);
        const parent = selected.parentElement;
        if (parent && parent !== document.body && parent !== document.documentElement) select(parent);
      } else if (event.key === "ArrowDown" && selected) {
        swallow(event);
        // Walk back down towards whatever the mouse is over.
        let child = hovered;
        while (child && child.parentElement !== selected) child = child.parentElement;
        if (child) select(child);
      }
    }],
    // Keep the page from reacting to the click that picks.
    ["mousedown", swallow],
    ["mouseup", swallow],
    ["pointerdown", swallow],
    ["pointerup", swallow],
    ["scroll", () => selected && select(selected)],
  ];
  for (const [type, handler] of listeners) window.addEventListener(type, handler, true);
})();
