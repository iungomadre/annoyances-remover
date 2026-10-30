// Injected by the popup each time "Pick element" is clicked.
(() => {
  if (globalThis.pageHiderPicking) return;
  globalThis.pageHiderPicking = true;

  const host = location.hostname;

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
    </style>
    <div class="box"></div>
    <div class="bar">
      <div class="target">Hover over the part of the page to hide</div>
      <div class="keys">Click to hide · ↑ select parent · ↓ select child · Esc to cancel</div>
    </div>
  `;
  const box = shadow.querySelector(".box");
  const targetLabel = shadow.querySelector(".target");
  document.documentElement.append(overlayHost);

  let hovered = null;
  let selected = null;

  function describe(element) {
    const text = normalizeText(element.textContent);
    if (!text) return `<${element.localName}> (no text, matched by position on the page)`;
    if (text.length > MAX_TEXT_LENGTH) return `<${element.localName}> (too much text, matched by position on the page)`;
    return `<${element.localName}> "${text.length > 80 ? `${text.slice(0, 80)}…` : text}"`;
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
  }

  function longestTextNode(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let longest = "";
    while (walker.nextNode()) {
      const value = walker.currentNode.nodeValue.trim();
      if (value.length > longest.length) longest = value;
    }
    return longest;
  }

  // Counts ancestors between the anchor and the picked element that have the same
  // tag and text, so the content script climbs to the same level next time.
  function textRank(element, anchor, text) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && !walker.currentNode.nodeValue.includes(anchor));
    let rank = 0;
    for (let node = walker.currentNode.parentElement; node !== element; node = node.parentElement) {
      if (node.localName === element.localName && normalizeText(node.textContent) === text) rank++;
    }
    return rank;
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
    const text = normalizeText(element.textContent);
    const base = { id: crypto.randomUUID(), label: describe(element) };
    if (text && text.length <= MAX_TEXT_LENGTH) {
      const anchor = longestTextNode(element);
      return { ...base, type: "text", tag: element.localName, text, anchor, rank: textRank(element, anchor, text) };
    }
    return { ...base, type: "selector", selector: buildSelector(element) };
  }

  function isSameRule(a, b) {
    return a.type === b.type && (a.type === "text" ? a.text === b.text && a.tag === b.tag && a.rank === b.rank : a.selector === b.selector);
  }

  async function pick(element) {
    const rule = buildRule(element);
    const rules = await loadRules(host);
    if (!rules.some((existing) => isSameRule(existing, rule))) {
      await saveRules(host, [...rules, rule]);
    }
  }

  function stop() {
    globalThis.pageHiderPicking = false;
    overlayHost.remove();
    for (const [type, handler] of listeners) window.removeEventListener(type, handler, true);
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
    ["click", (event) => {
      swallow(event);
      if (selected) pick(selected);
      stop();
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
