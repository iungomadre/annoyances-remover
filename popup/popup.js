const inputs = document.querySelectorAll("[data-setting]");

loadSettings().then((settings) => {
  for (const input of inputs) {
    input.checked = settings[input.dataset.setting];
  }
});

for (const input of inputs) {
  input.addEventListener("change", () => {
    chrome.storage.sync.set({ [input.dataset.setting]: input.checked });
  });
}

const siteSection = document.getElementById("site");
const rulesList = document.getElementById("rules");
const noRules = document.getElementById("no-rules");
const ruleCount = document.getElementById("rule-count");
const autoApply = document.getElementById("auto-apply");

function activeSite(tab) {
  try {
    const url = new URL(tab.url);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { host: url.hostname, origin: `${url.protocol}//${url.hostname}/*` };
    }
  } catch {}
  return null;
}

// Opening the popup grants temporary access to the tab (activeTab), which is
// used to apply this site's picks even where "Apply on every visit" is off.
async function ensureContentScript(tabId) {
  const [{ result: loaded }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.pageHiderLoaded === true,
  });
  if (!loaded) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["settings.js", "pattern.js", "content.js"] });
  }
}

let contentScriptReady;
let pagePort = null;
const ruleStatus = new Map();

function highlightOnPage(ruleId) {
  pagePort?.postMessage({ highlight: ruleId });
}

// Tells the user why nothing lit up on the page when that's the case.
function showHighlightResult({ ruleId, found, visible }) {
  const status = ruleStatus.get(ruleId);
  if (!status) return;
  status.textContent = !found ? "Not on the page right now" : !visible ? "On the page, but scrolled out of view" : "";
  status.hidden = !status.textContent;
}

async function startPicker(tabId, { refineId = null, autoApply }) {
  // The picker relies on the content script's helpers being on the page.
  await contentScriptReady;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (id, auto) => {
      globalThis.pageHiderRefineId = id;
      globalThis.pageHiderAutoApply = auto;
    },
    args: [refineId, autoApply],
  });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] });
  window.close();
}

const ICONS = {
  refine: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5v3h-3"/></svg>',
  remove: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
};

const TAG_NAMES = { a: "Link", button: "Button", img: "Image", svg: "Icon", video: "Video", iframe: "Embedded frame", input: "Input" };

function friendlyTag(tag) {
  return TAG_NAMES[tag] ?? "Element";
}

// What the user recognises the pick by (its text), and how it's matched.
function describeRule(rule) {
  if (rule.type === "selector") {
    const tag = rule.selector.split(" > ").at(-1).match(/^[a-z][a-z0-9-]*/)?.[0];
    // Position is used both for picks without text and for ones too large to compare.
    const kind = rule.label.includes("too large") ? "covering a large area" : "without readable text";
    return { title: `${friendlyTag(tag)} ${kind}`, meta: "Matched by its position on the page" };
  }
  if (!rule.pattern) {
    return { title: rule.text ?? rule.label, meta: "Saved in an old format and no longer hidden. Remove it and pick it again", warning: true };
  }
  if (!rule.pattern.some(isWord)) {
    return { title: `${friendlyTag(rule.tag)} with any text`, meta: "Matched by its layout only" };
  }
  const text = rule.pattern
    .filter((token) => token === null || isWord(token))
    .map((token) => token ?? "…")
    .join(" ")
    .replace(/…( …)+/g, "…");
  const meta = rule.pattern.includes(null) ? "Matches this text, ignoring the parts that change" : "Matches this exact text";
  return { title: `“${text}”`, meta };
}

function iconButton(kind, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${kind}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = ICONS[kind];
  button.addEventListener("click", onClick);
  return button;
}

function renderRules(tabId, host, rules) {
  ruleStatus.clear();
  rulesList.replaceChildren(
    ...rules.map((rule) => {
      const { title, meta, warning } = describeRule(rule);
      const item = document.createElement("li");
      const text = document.createElement("div");
      text.className = "rule-text";
      const titleElement = document.createElement("span");
      titleElement.className = "rule-title";
      titleElement.textContent = title;
      titleElement.title = title;
      const metaElement = document.createElement("span");
      metaElement.className = warning ? "rule-meta warning" : "rule-meta";
      metaElement.textContent = meta;
      const status = document.createElement("span");
      status.className = "rule-status";
      status.hidden = true;
      ruleStatus.set(rule.id, status);
      text.append(titleElement, metaElement, status);
      item.addEventListener("mouseenter", () => highlightOnPage(rule.id));
      item.addEventListener("mouseleave", () => {
        highlightOnPage(null);
        status.hidden = true;
      });
      item.append(text);
      if (rule.type === "text" && rule.pattern) {
        item.append(
          iconButton("refine", "Content changed? Pick it again and the parts that differ will be ignored", () =>
            startPicker(tabId, { refineId: rule.id, autoApply: autoApply.checked }),
          ),
        );
      }
      item.append(
        iconButton("remove", "Stop hiding this", () => saveRules(host, rules.filter((other) => other.id !== rule.id))),
      );
      return item;
    }),
  );
  ruleCount.textContent = rules.length || "";
  ruleCount.hidden = !rules.length;
  noRules.hidden = rules.length > 0;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = activeSite(tab);
  const showUnsupported = () => {
    siteSection.hidden = true;
    document.getElementById("unsupported").hidden = false;
  };
  if (!site) {
    showUnsupported();
    return;
  }

  // Injecting waits for the page to respond, which can be slow on busy pages,
  // so the popup is filled in from storage without waiting for it.
  contentScriptReady = ensureContentScript(tab.id);
  contentScriptReady.then(() => {
    pagePort = chrome.tabs.connect(tab.id, { name: "popup" });
    pagePort.onMessage.addListener(showHighlightResult);
  }, showUnsupported);

  siteSection.hidden = false;
  document.getElementById("site-name").textContent = site.host;

  const [rules, autoApplyGranted] = await Promise.all([
    loadRules(site.host),
    chrome.permissions.contains({ origins: [site.origin] }),
  ]);
  renderRules(tab.id, site.host, rules);
  chrome.storage.onChanged.addListener((changes, area) => {
    const key = rulesKey(site.host);
    if (area === "local" && key in changes) renderRules(tab.id, site.host, changes[key].newValue ?? []);
  });

  autoApply.checked = autoApplyGranted;
  autoApply.addEventListener("change", async () => {
    const permissions = { origins: [site.origin] };
    const ok = autoApply.checked ? await chrome.permissions.request(permissions) : await chrome.permissions.remove(permissions);
    if (!ok) autoApply.checked = !autoApply.checked;
  });

  document.getElementById("pick").addEventListener("click", () => startPicker(tab.id, { autoApply: autoApply.checked }));
}

init();
