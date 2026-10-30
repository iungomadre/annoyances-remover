const TRIGGER_TEXT = "Microphone muted by system";
const MAX_POPUP_TEXT_LENGTH = 400;

function findPopupRoot(textElement) {
  let node = textElement;
  let root = textElement;

  while (node.parentElement && node.parentElement !== document.body) {
    const parent = node.parentElement;
    if (parent.textContent.length > MAX_POPUP_TEXT_LENGTH) break;
    if (parent.querySelector("[role='toolbar'], video, [role='main']")) break;
    root = parent;
    node = parent;
    if (parent.matches("[role='dialog'], [role='alertdialog'], [role='tooltip']")) break;
  }

  return root;
}

const HIDDEN_ATTR = "data-mute-warning-remover-hidden";
const ENABLED_CLASS = "mute-warning-remover-enabled";

// visibility (not display: none) keeps the popup laid out and animating, so Meet's
// own show/hide logic still works and the popup can be revealed again intact.
const style = document.createElement("style");
style.textContent = `
  html.${ENABLED_CLASS} [${HIDDEN_ATTR}],
  html.${ENABLED_CLASS} [${HIDDEN_ATTR}] * {
    visibility: hidden !important;
  }
`;
document.head.appendChild(style);

function markWarnings() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (!textNode.nodeValue.includes(TRIGGER_TEXT)) continue;
    const element = textNode.parentElement;
    if (!element || element.closest(`[${HIDDEN_ATTR}]`)) continue;
    findPopupRoot(element).setAttribute(HIDDEN_ATTR, "");
  }
}

let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    markWarnings();
  });
}).observe(document.body, { childList: true, subtree: true });

markWarnings();

function applyEnabled(enabled) {
  document.documentElement.classList.toggle(ENABLED_CLASS, enabled);
}

loadSettings().then((settings) => applyEnabled(settings.enabled));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "enabled" in changes) {
    applyEnabled(changes.enabled.newValue);
  }
});
