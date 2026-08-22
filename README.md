# Viz — First Local Video Editor

Viz: the first local video editor for free. No server, no backend, no data leaves your machine. A fully client-side video editor that runs entirely in your browser.

Developed by **[Zrnge](https://zrnge.com/viz)** — [github.com/zrnge/viz](https://github.com/zrnge/viz).

[![Try it for free now](https://img.shields.io/badge/Try_it_for_free_now-8b5cf6?style=for-the-badge&logo=rocket&logoColor=white)](https://zrnge.com/viz/)

Built with **Vanilla JS**, **Vite**, and **[ffmpeg.wasm](https://ffmpegwasm.netlify.app/)**.

![Dark themed editor](https://img.shields.io/badge/Theme-Dark-0e0e18?style=flat-square)
![No backend](https://img.shields.io/badge/Backend-None-34d399?style=flat-square)
![ffmpeg.wasm](https://img.shields.io/badge/FFmpeg-WASM-8b5cf6?style=flat-square)

## Features

- **Upload** — Drag-and-drop or file picker (MP4, WebM, MOV, PNG/JPEG/GIF/WebP, MP3/WAV/AAC/OGG/M4A)
- **Multi-track timeline** — Video, image, text, and audio layers with vertical scrolling
- **Preview** — HTML5 video player with custom controls
- **Edit** — Trim, split, copy, paste, duplicate, delete, undo/redo
- **Move between tracks** — Drag clips vertically to compatible tracks
- **Text overlays** — Font, size, color, and background styling
- **Audio mixing** — Video audio + audio clips are mixed and exported
- **Export** — Download the edited video (MP4 via ffmpeg.wasm, WebM fallback)
- **Project save/load** — Export/import project JSON (timeline + edits; media files must be re-linked)
- **Keyboard shortcuts** — Space, I, O, T, S, Del, E, Arrow keys, Ctrl+Z/Y

## How It Works

All video processing uses [ffmpeg.wasm](https://github.com/nicolo-ribaudo/ffmpeg.wasm), a WebAssembly port of FFmpeg. The WASM core is self-hosted in `public/ffmpeg-core/` so the app works even if third-party CDNs are blocked, with a CDN fallback for resilience.

### Cross-Origin Isolation (COOP/COEP)

ffmpeg.wasm requires `SharedArrayBuffer`, which needs cross-origin isolation headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

**Local development:** Vite's dev server sets these headers automatically.

**GitHub Pages:** Static hosts can't set custom headers, so we use [`coi-serviceworker.js`](https://github.com/nicolo-ribaudo/coi-serviceworker) — a service worker shim that injects the required headers. It causes one automatic page reload on first visit.

---

## Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- npm 9+

### Setup

```bash
# Clone the repository
git clone https://github.com/zrnge/viz.git
cd viz

# Install dependencies
npm install

# Start development server
npm run dev
```

The dev server starts at `http://localhost:5173` with COOP/COEP headers enabled.

### Build for Production

```bash
npm run build
```

The `prebuild` script copies the self-hosted ffmpeg core from `node_modules/@ffmpeg/core` to `public/ffmpeg-core/`.

Preview the production build:

```bash
npm run preview
```

---

## GitHub Pages Deployment

### Option 1: GitHub Actions (Recommended)

1. Push your code to the `main` branch
2. Go to **Settings → Pages** in your GitHub repo (`https://github.com/zrnge/viz/settings/pages`)
3. Under **Source**, select **GitHub Actions** — **NOT** "Deploy from a branch"
4. The included `.github/workflows/deploy.yml` builds and deploys `dist/` on every push to `main`
5. The site will deploy to `https://zrnge.com/viz/`

> **Important:** If you previously used "Deploy from a branch", GitHub Pages may keep serving the raw source files. After switching to GitHub Actions, go to **Actions** and re-run the latest workflow, then wait 1–2 minutes for the deployment to update.

> **Note:** `vite.config.js` defaults to `base: '/viz/'` for deployments under the `/viz/` subpath (e.g., `zrnge.com/viz/`). If you deploy to a custom-domain root (e.g., `zrnge.com/`), set the `BASE_PATH` environment variable to `/` in the workflow or change the default in `vite.config.js`.

### Option 2: Manual gh-pages Branch

```bash
npm run build
npx gh-pages -d dist
```

Then go to **Settings → Pages** and set the source to `gh-pages` branch.

---

## Project Structure

```
├── public/
│   ├── coi-serviceworker.js    # Cross-origin isolation shim
│   ├── 404.html                # SPA redirect for GitHub Pages
│   └── ffmpeg-core/            # Self-hosted FFmpeg WASM core
├── scripts/
│   └── copy-ffmpeg-core.js    # Prebuild copy helper
├── src/
│   ├── main.js                 # App orchestrator
│   ├── style.css               # Dark theme + glassmorphism styles
│   ├── composition.js          # Composition data model
│   ├── ffmpeg-worker.js        # FFmpeg loading, audio mix, export
│   ├── multi-timeline.js        # Multi-track timeline
│   ├── canvas-preview.js       # Preview renderer + transforms
│   ├── video-player.js         # HTML5 video player wrapper
│   ├── toolbar.js              # Toolbar buttons & shortcuts
│   ├── upload.js               # Drag-and-drop upload
│   ├── media-manager.js        # Add video/image/text/audio
│   ├── properties-panel.js     # Element properties editor
│   ├── context-menu.js         # Right-click menu
│   ├── clipboard.js            # Copy/paste/duplicate/delete
│   └── utils.js                # Helpers (formatTime, validation, toasts)
├── index.html                  # SPA entry point
├── vite.config.js              # Vite config (base path, headers, chunks)
├── package.json
└── README.md
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `I` | Set In point |
| `O` | Set Out point |
| `T` | Trim to in/out range |
| `S` | Split at playhead |
| `Del` / `Backspace` | Delete element |
| `Ctrl+E` | Export |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste |
| `Ctrl+D` | Duplicate |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `←` / `→` | Skip back/forward |
| `Shift+←` / `Shift+→` | Frame step |

## Developer

Made with ❤️ by **[Zrnge](https://zrnge.com/viz)**.

- Website: [zrnge.com/viz](https://zrnge.com/viz)
- Source: [github.com/zrnge/viz](https://github.com/zrnge/viz)

## Troubleshooting

### Site loads unstyled or shows 404 for `/src/main.js` and `coi-serviceworker.js`

This means GitHub Pages is serving the raw source files instead of the built `dist/` output.

**Fix:**
1. Go to `https://github.com/zrnge/viz/settings/pages`
2. Set **Source** to **GitHub Actions**
3. Save, then go to `https://github.com/zrnge/viz/actions`
4. Re-run the latest workflow
5. Wait 1–2 minutes and hard-refresh `https://zrnge.com/viz/`

### Workflow fails with "Failed to create deployment (status: 404)"

GitHub Pages is not enabled. Follow the steps above and set the source to **GitHub Actions** first.

## License

MIT
