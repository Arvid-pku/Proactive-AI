# Proactive-AI Extension Starter

An MV3 Chrome extension with a minimal overlay and side panel, plus a backend stub for AI suggestions (deployable on Vercel).

## Quick start

### Prerequisites
- Node 18+
- Chrome/Chromium-based browser
- Git

### Install

```bash
npm install
```

### Build the extension

```bash
npm run build
```

The built extension is emitted to `extension/dist`.

### Load in Chrome (Developer Mode)
1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the `extension/dist` directory.

You should see the extension appear. It injects a minimal overlay when you select text on any page.

### Side Panel
Click the extension's icon and choose **Open side panel** (or Chrome may auto-handle the side panel icon in the toolbar depending on your version). The panel displays content sent from the overlay.

## Backend (Vercel) - Optional for now
The extension currently uses local heuristics. A backend endpoint can suggest actions using an LLM.

### Deploy to Vercel
1. Create a new Vercel project from this repository.
2. Set environment variable: `OPENAI_API_KEY` (optional; if not set, the API falls back to heuristics).
3. Deploy. The function `api/suggest` will be available at `https://<your-project>.vercel.app/api/suggest`.

Update the extension to use this endpoint in a future step.

## Scripts
- `npm run build` – builds the extension with Vite + CRXJS
- `npm run dev` – watch-mode build for faster local iteration

## Project structure

```
.
├─ api/
│  └─ suggest.ts          # Vercel serverless function (stub)
├─ extension/
│  ├─ src/
│  │  ├─ background.ts    # Service worker
│  │  ├─ content.ts       # Content script (overlay)
│  │  ├─ panel.ts         # Side panel logic
│  │  └─ styles.css       # Overlay styles
│  ├─ panel.html          # Side panel UI
│  ├─ manifest.json       # MV3 manifest
│  ├─ tsconfig.json
│  └─ vite.config.ts
├─ .gitignore
├─ README.md
└─ package.json
```

## Next steps
- Wire backend `api/suggest` to the content script decision layer.
- Add plotting (Plotly) and optional Pyodide in a Worker for Python execution.
- Add notes sync (Supabase/Firebase) and settings UI.
