# Annoyance Remover

Chrome extension (Manifest V3) for hiding parts of web pages you don't want to see, such as the "Microphone muted by system" popup that Google Meet shows over shared content.

## Usage

1. Click the extension icon on the page and choose **Pick element to hide**
2. Hover over what you want gone. **↑** / **↓** widen or narrow the selection, **Esc** cancels
3. Click to hide it. It's saved for that site and hidden again whenever it reappears

Picks are remembered by their text and the layout of elements inside them, so they keep working when the site changes its styling and in any language. Elements without text (or very large ones) are remembered by their position on the page instead, which can break when the site updates.

If a pick's content changes between visits (say "Alice is presenting" becomes "Bob is presenting"), click **↻** next to it in the popup and pick it again. The parts that differ are ignored from then on (here, the name), and the rest still has to match. If the text differs completely, only the layout is compared. Picks with too little in common to hide safely are refused.

Picking something turns on **Apply on every visit** for that site, so it's hidden automatically from then on; Chrome asks for access to the site the first time. If you decline, or turn the switch off later, picks apply only once you open the popup on a page. Picking also turns hiding back on if it was switched off.

The **Hide picked elements** switch shows everything again without reloading. Remove a pick with **×** in the popup.

## Load locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder
4. After changing the code, click the reload icon on the extension's card and reload the tab

## Publish to the Chrome Web Store

1. Register at https://chrome.google.com/webstore/devconsole (one-time $5 fee)
2. `zip -r extension.zip manifest.json background.js settings.js pattern.js content.js picker.js popup icons`
3. Developer Dashboard → **Add new item** → upload the zip
4. Fill in the listing (description, at least one 1280x800 screenshot, 440x280 small promo tile, category, privacy practices — declare that no data is collected; justify the optional host permission as letting users choose sites where their picks apply automatically)
5. Submit for review (usually a few days)
