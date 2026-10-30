const DEFAULT_SETTINGS = {
  enabled: true,
};

function loadSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}
