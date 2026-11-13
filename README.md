# UNO Online Multiplayer (React + Socket.IO)

Minimalistisches Online-UNO komplett in React (schwarzer Hintergrund, weißer Text, dezente 4-Farben-Akzente auf den Karten) nach offiziellen Standardregeln + optionalem **Einwerfen**-Modus und **2× Paar-Legen**.

## Lokal starten

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Server & Socket.IO Proxy: läuft automatisch über Port `5173` → `3001`.

## GitHub Pages Deployment (`.github/workflows/deploy.yml`)

Der Workflow in `.github/workflows/deploy.yml` testet, typecheckt, baut (`VITE_BASE_PATH` automatisch für Project-Pages wie `/Uno/` gesetzt) und deployt das React-Frontend bei jedem Push auf `main`/`master` automatisch auf GitHub Pages.

### Einrichtung auf GitHub:
1. Auf GitHub im Repository unter **Settings → Pages** als Source **GitHub Actions** auswählen.
2. **Backend-Server für weltweiten Online-Multiplayer verbinden** (GitHub Pages hostet nur statische Dateien ohne Node.js-Prozess):
   - Deploye das Repo als Web Service auf **Render** (über `render.yaml`), **Railway**, **Fly.io** oder **Docker** (`Dockerfile`) — Port `443` HTTPS/WSS inklusive HTTP-Polling-Fallback.
   - Hinterlege die HTTPS-URL deines Servers entweder:
     - unter **Settings → Secrets and variables → Actions → Variables** als `VITE_WS_URL` (wird direkt beim GitHub-Pages-Build eingebunden), **oder**
     - direkt auf der GitHub-Pages-Seite im Feld **UNO-Server verbinden** (wird lokal gespeichert und über den kopierten Invite-Link automatisch mitgeteilt).

## Produktion (Fullstack auf einem Port)

```bash
npm run build
npm start
```

## Tests & Typecheck

```bash
npm test
npm run typecheck
```
