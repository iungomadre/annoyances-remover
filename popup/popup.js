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
    await chrome.scripting.executeScript({ target: { tabId }, files: ["settings.js", "content.js"] });
  }
}

function renderRules(host, rules) {
  rulesList.replaceChildren(
    ...rules.map((rule) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = rule.label;
      label.title = rule.type === "text" ? rule.text : rule.selector;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Stop hiding this";
      remove.addEventListener("click", () => {
        saveRules(host, rules.filter((other) => other.id !== rule.id));
      });
      item.append(label, remove);
      return item;
    }),
  );
  noRules.hidden = rules.length > 0;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = activeSite(tab);
  try {
    if (!site) throw new Error("Unsupported page");
    await ensureContentScript(tab.id);
  } catch {
    document.getElementById("unsupported").hidden = false;
    return;
  }

  siteSection.hidden = false;
  document.getElementById("site-name").textContent = site.host;

  renderRules(site.host, await loadRules(site.host));
  chrome.storage.onChanged.addListener((changes, area) => {
    const key = rulesKey(site.host);
    if (area === "local" && key in changes) renderRules(site.host, changes[key].newValue ?? []);
  });

  autoApply.checked = await chrome.permissions.contains({ origins: [site.origin] });
  autoApply.addEventListener("change", async () => {
    const permissions = { origins: [site.origin] };
    const ok = autoApply.checked ? await chrome.permissions.request(permissions) : await chrome.permissions.remove(permissions);
    if (!ok) autoApply.checked = !autoApply.checked;
  });

  document.getElementById("pick").addEventListener("click", async () => {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
    window.close();
  });
}

init();
