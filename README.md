# Annoyance Remover

A Chrome extension for hiding the parts of web pages you don't want to see: popups, banners, notices, buttons, anything. Point at it once, and it stays hidden every time it shows up again.

## Hiding something

1. Click the extension icon and choose **Pick element to hide**
2. Hover over what you want gone. **↑** / **↓** widen or narrow the selection
3. Click or press **Enter** to hide it (**Esc** cancels)

The pick is saved for that site. Whenever the same thing appears again, even after the page changes or reloads, it's hidden straight away.

Hidden elements are made invisible rather than removed, so the page keeps working as normal around them and they can be shown again at any time.

## How picks are recognised

A pick is remembered by its text and the arrangement of elements inside it, not by the site's internal code. That means it keeps working when the site restyles itself, and it works in any language.

Elements without text, or very large ones, are remembered by their position on the page instead. That can break when the site changes its layout.

### Content that changes

Some things look the same every time but say something slightly different, like "Alice is presenting" one day and "Bob is presenting" the next. To handle that, click **↻** next to the pick in the popup and pick it again. Whatever differs between the two is ignored from then on (here, the name), while the rest still has to match. If the text is completely different, only the layout is compared.

If the two picks have too little in common to hide safely, the extension says so instead of saving, so it doesn't end up hiding unrelated parts of the page.

## Managing picks

The popup lists everything hidden on the current site, with how each pick is matched:

- **Hover** a pick to see where it is on the page
- **↻** picks it again to ignore content that changes
- **×** stops hiding it

The **Hide picked elements** switch at the top shows everything again without reloading, and hides it again when switched back on.

## Where picks apply

By default, picks apply once you open the popup on a page, so the extension needs no access to any site up front.

To have them hidden automatically on every visit, turn on **Apply on every visit** for that site. Chrome asks for access to that one site the first time. Turning it off removes the access again.

## Privacy

Nothing leaves your browser. Picks are stored locally in Chrome; only the on/off switch syncs between your devices through your Chrome account.

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
