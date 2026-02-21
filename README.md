# Mosa Tea Checklist

## Project Overview
Simple full-stack learning project for Mosa Tea operations.

Current app flow:
- Landing page with two options: `Opening` and `Closing`
- `Opening` page placeholder
- `Closing` page with a chunked checklist workflow

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
Goal: both closers see the same checklist state and who checked each section.

How it works:
- Add worker name in the `Worker name` field on the closing page.
- Use the same URL/session for both workers:
  - Example: `closing.html?session=2026-02-21`
- When shared mode is enabled, updates sync live through Firebase Realtime Database.

If shared mode is not configured, app runs in local-only mode automatically.

## Daily CSV Archive
Closing data can now be archived to CSV by session date.

How it works:
- Session date comes from URL, example: `closing.html?session=2026-02-21`
- App schedules an export at local midnight of the next day:
  - For `2026-02-21`, export triggers at `2026-02-22 12:00 AM` local time
- CSV includes:
  - section key/title
  - chunk info
  - completion status
  - checked by / checked at
  - last updated by / last updated at
- A backup button is available on closing page: `Download CSV Now`

Important limitation:
- This is browser-driven export. At least one device with the page open must still be active when midnight passes.
- For guaranteed unattended exports (even when no one is on the page), use a backend scheduled job (for example Firebase Cloud Functions + Storage).

## Enable Shared Mode
1. Create a Firebase project with Realtime Database enabled.
2. Open `src/shared-config.js`.
3. Set:
   - `enabled: true`
   - Firebase keys (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`)
4. Deploy/host and share the same `closing.html?session=...` link in your QR code.

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
- `src/opening.html` - opening page (placeholder)
- `src/closing.html` - closing checklist UI
- `src/style.css` - global styles and checklist styles
- `src/index.js` - checklist logic, chunk controls, checked-by metadata, local + shared sync, CSV export scheduling
- `src/shared-config.js` - shared sync configuration (disabled by default)
