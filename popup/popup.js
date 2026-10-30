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
