# Motivational Quote New Tab

A Chrome/Brave New Tab extension that displays your own motivational quotes plus a customizable grid of site shortcuts. Quotes sync across devices using `chrome.storage.sync`.

## Features
- Random motivational quote on every new tab
- Quote manager (add/edit/delete/bulk import)
- Manual site shortcuts (add, edit, remove)
- Drag‑and‑drop reorder for site tiles
- Light/Dark theme toggle with icons
- Works in Chrome and Brave

## How to Use
1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `quote-tab-extension` folder

## Manage Quotes
Open the extension’s options:
- `chrome://extensions` → **Details** → **Extension options**
- Or click **Manage quotes** on the New Tab page

## Customize Sites
- Click **Add site** tile to create a shortcut
- Hover a tile to **Edit** or **Remove**
- Drag tiles to reorder

## Tech Stack
- Manifest V3
- Vanilla HTML/CSS/JS
- `chrome.storage.sync` for data persistence

## License
MIT
