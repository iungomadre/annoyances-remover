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

function removeWarning() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (!textNode.nodeValue.includes(TRIGGER_TEXT)) continue;
    const element = textNode.parentElement;
    if (!element) continue;
    findPopupRoot(element).remove();
  }
}

let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    removeWarning();
  });
}).observe(document.body, { childList: true, subtree: true });

removeWarning();
