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
- `Complete This Chunk` button marks all boxes in the active tab complete and moves to the next tab.
- Progress is saved in `localStorage` (checkboxes and active tab).

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
- `src/index.js` - checklist chunk logic + localStorage persistence
