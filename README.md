# VIM — La valigia immateriale

A multilingual Progressive Web App (PWA) for collecting Palestinian intangible
cultural heritage. It presents a digital form (Italian, English, العربية with
RTL), one question per screen, and submits the data — through the **VIM
backend** — to **KoboToolbox**.

## What it is

- A self-contained single-file web app, built from `src/` into `dist/` (the PWA)
  and `demo-desktop/` (a demo wrapped in a phone mockup, for presentations).
- Installable on iPhone/Android ("Add to Home Screen") and usable **offline**.
- The form definition comes from KoboToolbox (synced into the app).

## Storage (offline)

Local storage is a **buffer**; KoboToolbox is the source of data.

- **IndexedDB** keeps drafts, the outbox (forms waiting to send) and a text-only
  log of sent forms — one record each.
- A **service worker** caches the app shell, so the app opens offline.
- Completed forms are queued and **sent automatically when online**; a stable
  instance id makes re-sends safe (no duplicates).
- The app requests **persistent storage** and warns when space runs low.

See `SETUP.md` §6 for details.

## Build & run

Requires Node ≥ 18. Copy `.env.example` to `.env` and fill in the values.

```bash
npm install
npm run build      # generates dist/ (PWA) and demo-desktop/ (demo)
npm start          # serve the PWA on http://localhost:8765
npm run demo       # serve the demo on http://localhost:8766
npm test           # unit + DOM tests
```

## Documentation

- `SETUP.md` — setup, build, run, deploy, offline/storage, troubleshooting.
- `src/README.md` — source layout and form reference.

## License

GPL-2.0 — see [`LICENSE`](LICENSE).
