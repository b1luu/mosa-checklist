# Mosa Tea Checklist

## Project Overview
Simple full-stack learning project for Mosa Tea operations.

Current app flow:
- Landing page with two options: `Opening` and `Closing`
- `Opening` page with operational checklist sections
- `Closing` page with a chunked checklist workflow

## Current Opening Checklist Behavior
Opening page now includes checklist sections for:
- `Lights`
- `Machines & Equipment`
- `Systems & Front`
- `Supplies & Cleanliness`
- `Product Quality`
- `Daily Prep`

Opening checklist tasks now save by session date, require worker name attribution, and show checked-by/checked-at metadata.

## Current Closing Checklist Behavior
- Split into two tabs:
  - `Front Bar + Front Seating`
  - `Back Kitchen + Inventory`
- Each checklist section is shown as one padded box.
- Each box has one checkbox at the bottom: `Mark as complete`.
- Each completed section stores:
  - `checked` status
  - `checkedBy` worker name
  - `checkedAt` timestamp
- `Complete This Chunk` button marks all boxes in the active tab complete and moves to the next tab.
- Local fallback is saved in `localStorage`.

## Shared Multi-Worker Mode (QR Friendly)
Goal: workers on opening or closing see the same checklist state and who checked each item/section.

How it works:
- Add worker name in the `Worker name` field on opening or closing page.
- Use the same URL/session for both workers:
  - Example: `opening.html?session=2026-02-21`
  - Example: `closing.html?session=2026-02-21`
- When shared mode is enabled, updates sync live through Firebase Realtime Database.

If shared mode is not configured, app runs in local-only mode automatically.

## Master CSV (Continuously Updated)
Checklist data can be kept in continuously updated master datasets.

How it works:
- On every checklist change, section rows are updated in:
  - local cache (`localStorage`)
  - Firebase Realtime Database (when shared mode is enabled)
- Master rows are stored by session id + section key.
- `Download Master CSV` exports one combined CSV across all saved sessions.

CSV columns:
- exported_at
- session_id
- section_key / section_title
- chunk_number / chunk_label
- completed
- checked_by / checked_at
- last_updated_by / last_updated_at

## Enable Shared Mode
1. Create a Firebase project with Realtime Database enabled.
2. Open `src/shared-config.js`.
3. Set:
   - `enabled: true`
   - Firebase keys (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`)
4. Deploy/host and share the same `opening.html?session=...` or `closing.html?session=...` link in your QR code.

## Tech Stack
- HTML
- CSS
- Vanilla JavaScript

## Local Development
Because this is a static site, open `src/index.html` in a browser, or run a simple local server:

```bash
cd src
python3 -m http.server 5500
```

Then open: `http://localhost:5500`

## Project Structure
- `src/index.html` - landing page
- `src/opening.html` - opening checklist UI
- `src/closing.html` - closing checklist UI
- `src/style.css` - global styles and checklist styles
- `src/index.js` - checklist logic, chunk controls, checked-by metadata, local + shared sync, master CSV updates/export
- `src/shared-config.js` - shared sync configuration (disabled by default)
