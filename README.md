# UNO Online Multiplayer (React + Socket.IO)

Minimalistisches Online-UNO komplett in React (schwarzer Hintergrund, weißer Text, dezente 4-Farben-Akzente auf den Karten) nach offiziellen Standardregeln.

## Lokal starten

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Server & Socket.IO Proxy: läuft automatisch über Port `5173` → `3001`.

## Produktion & Weltweites Spielen hinter jeder Firewall

Die App kombiniert das React-Frontend und den Socket.IO-Server auf **einem einzigen Port**.
Dadurch läuft die komplette Kommunikation über **HTTPS / WSS (Port 443)** inklusive automatischem **HTTP Long-Polling-Fallback**, falls eine Schul-, Firmen- oder Mobilfunk-Firewall WebSockets/UDP blockiert.

### Option 1: Cloud-Deployment (empfohlen, kostenlos möglich)
- **Render** (über die enthaltene `render.yaml`), **Railway**, **Fly.io** oder **Docker** (`Dockerfile`):
  - Build: `npm install && npm run build`
  - Start: `npm start`
- Danach einfach den öffentlichen `https://...`-Link teilen — funktioniert weltweit aus jedem Netz.

### Option 2: Direkt vom eigenen PC teilen (z. B. via Cloudflare Tunnel)
```bash
npm run build
npm start
# in einem zweiten Terminal:
cloudflared tunnel --url http://localhost:3001
```
Den generierten `https://...trycloudflare.com`-Link kannst du direkt an Freunde weltweit senden.

## Tests & Typecheck

```bash
npm test
npm run typecheck
```

