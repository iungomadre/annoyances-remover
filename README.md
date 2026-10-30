# Meet Mute Warning Remover

Chrome extension (Manifest V3) for hiding parts of web pages you don't want to see, such as the "Microphone muted by system" popup that Google Meet shows over shared content.

## Usage

1. Click the extension icon on the page and choose **Pick element to hide**
2. Hover over what you want gone. **↑** / **↓** widen or narrow the selection, **Esc** cancels
3. Click to hide it. It's saved for that site and hidden again whenever it reappears

Picks are remembered by their text, so they keep working when the site changes its markup and in any language. Elements without text (or with a lot of it) are remembered by their position on the page instead, which can break when the site updates.

By default, picks apply once you open the popup on a page. Turn on **Apply on every visit** to hide them automatically on that site; Chrome asks for access to the site the first time.

The **Hide picked elements** switch shows everything again without reloading. Remove a pick with **×** in the popup.

## Load locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder
4. After changing the code, click the reload icon on the extension's card and reload the tab

## Publish to the Chrome Web Store

1. Register at https://chrome.google.com/webstore/devconsole (one-time $5 fee)
2. `zip -r extension.zip manifest.json background.js settings.js content.js picker.js popup icons`
3. Developer Dashboard → **Add new item** → upload the zip
4. Fill in the listing (description, at least one 1280x800 screenshot, 440x280 small promo tile, category, privacy practices — declare that no data is collected; justify the optional host permission as letting users choose sites where their picks apply automatically)
5. Submit for review (usually a few days)
