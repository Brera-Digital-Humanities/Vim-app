# VIM — La valigia immateriale

> **Provisional README** — the project is a work in progress (beta).

A multilingual Progressive Web App (PWA) for collecting Palestinian intangible
cultural heritage. It presents a digital form (Italian, English, العربية with
RTL), one question per screen, and sends the collected data to **KoboToolbox**.

## What it is

- A self-contained single-file web app, built from `src/` into `dist/` (the PWA)
  and `test/` (a demo wrapped in a phone mockup, for presentations).
- Installable on iPhone/Android ("Add to Home Screen") and usable **offline**.
- The form definition comes from KoboToolbox (synced into the app).

## Storage (offline)

The app is designed to work in the field without a connection. Local storage is
a **buffer**; the source of truth is KoboToolbox.

- **IndexedDB** keeps drafts, the outbox (forms waiting to be sent), the sent
  log, the login and the chosen language — one record per form.
- A **service worker** caches the app shell, so the app opens offline.
- Completed forms are queued offline and **sent automatically** when the network
  returns; each form carries a stable instance id so re-sends are not duplicated.
- The app requests **persistent storage** and warns when space runs low.

See `SETUP.md` (section "Offline, storage e sincronizzazione") for details.

## Build & run

Requires Node ≥ 18. Copy `.env.example` to `.env` and fill in the values.

```bash
npm install
npm run build      # generates dist/ (PWA) and test/ (demo)
npm start          # serves the PWA on http://localhost:8765
npm run demo       # serves the demo on http://localhost:8766
```

## Documentation

- `SETUP.md` — setup, build, development workflow, deploy, offline/storage.
- `src/README.md` — technical reference of the form sources.

References used:
- KoboToolbox API — https://support.kobotoolbox.org / https://eu.kobotoolbox.org/api/v2/
- OpenRosa / XForm submission standard — https://docs.getodk.org/openrosa/
- PWA, IndexedDB, Service Workers (MDN) — https://developer.mozilla.org/

## License

GPL-2.0 — GNU General Public License, version 2. See [`LICENSE`](LICENSE).
