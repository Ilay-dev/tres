# UNO Online Multiplayer (React + Browser-Host WebRTC)

Minimalistisches Online-UNO komplett in React (schwarzer Hintergrund, weißer Text, dezente 4-Farben-Akzente auf den Karten) nach offiziellen Standardregeln + **Einwerfen**-Modus und **2× Paar-Legen** — **ohne externen Spielserver**.

Der Spieler, der einen Room erstellt (**Host**), ist direkt im Browser der autoritative Spielserver. Andere Spieler verbinden sich per **WebRTC DataChannel (PeerJS)** über den Room-Code oder Invite-Link.

## GitHub Pages Deployment (`.github/workflows/deploy.yml`)

1. Repo auf GitHub pushen (`main` oder `master`).
2. In GitHub unter **Settings → Pages** als *Source* **GitHub Actions** wählen.
3. `.github/workflows/deploy.yml` testet, baut (`VITE_BASE_PATH` automatisch gesetzt) und deployt die statische App direkt auf GitHub Pages — fertig, kein separater Server nötig.

## Lokal starten

```bash
npm install
npm run dev
```

Öffne `http://localhost:5173`.

## Tests & Typecheck

```bash
npm test
npm run typecheck
npm run build
```
