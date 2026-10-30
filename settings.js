const DEFAULT_SETTINGS = {
  enabled: true,
};

function loadSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

// Rules live in local storage (sync's 8 KB per-item quota is too small),
// one key per site so each page only loads its own.
function rulesKey(host) {
  return `rules:${host}`;
}

async function loadRules(host) {
  const key = rulesKey(host);
  const stored = await chrome.storage.local.get({ [key]: [] });
  return stored[key];
}

function saveRules(host, rules) {
  const key = rulesKey(host);
  return rules.length ? chrome.storage.local.set({ [key]: rules }) : chrome.storage.local.remove(key);
}
