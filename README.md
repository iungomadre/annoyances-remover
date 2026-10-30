# Meet Mute Warning Remover

Chrome extension (Manifest V3) that removes the "Microphone muted by system" popup in Google Meet.

## Load locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder
4. Reload any open Meet tab
5. Click the extension icon in the toolbar to open the settings popup and toggle it on or off

## Publish to the Chrome Web Store

1. Register at https://chrome.google.com/webstore/devconsole (one-time $5 fee)
2. `zip -r extension.zip manifest.json settings.js content.js popup icons`
3. Developer Dashboard → **Add new item** → upload the zip
4. Fill in the listing (description, at least one 1280x800 screenshot, 440x280 small promo tile, category, privacy practices — declare that no data is collected)
5. Submit for review (usually a few days)
