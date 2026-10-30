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

function renderRules(tabId, host, rules) {
  rulesList.replaceChildren(
    ...rules.map((rule) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = rule.label;
      label.title = rule.label;
      item.append(label);
      if (rule.type === "text" && rule.pattern) {
        const refine = document.createElement("button");
        refine.type = "button";
        refine.textContent = "↻";
        refine.title = "Its content changed? Pick it again and the parts that differ will be ignored";
        refine.addEventListener("click", () => startPicker(tabId, { refineId: rule.id, autoApply: autoApply.checked }));
        item.append(refine);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Stop hiding this";
      remove.addEventListener("click", () => {
        saveRules(host, rules.filter((other) => other.id !== rule.id));
      });
      item.append(remove);
      return item;
    }),
  );
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
  contentScriptReady.catch(showUnsupported);

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

  // New picks turn on "Apply on every visit". Chrome only lets the popup ask for
  // site access in response to a click here, so it's asked before picking rather
  // than after. Picking goes ahead either way.
  document.getElementById("pick").addEventListener("click", async () => {
    if (!autoApply.checked) {
      autoApply.checked = await chrome.permissions.request({ origins: [site.origin] }).catch(() => false);
    }
    startPicker(tab.id, { autoApply: autoApply.checked });
  });
}

init();
