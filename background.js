// Keeps the auto-run content script registered on exactly the sites the user has
// granted access to from the popup.
const CONTENT_SCRIPT_ID = "page-hider";

async function syncContentScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => {});
  if (!origins.length) return;
  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      matches: origins,
      js: ["settings.js", "pattern.js", "content.js"],
      runAt: "document_idle",
    },
  ]);
}

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.permissions.onAdded.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);
