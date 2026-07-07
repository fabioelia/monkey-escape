# 🕹️ F1V Arcade

Two browser games, no build step — static files only. The root `index.html`
is a launcher that picks between them.

## 🐵 Monkey Escape (`monkey/`)

A 3D treetop chase obby: play a monkey escaping a chimpanzee across six
treetop stages. Built with [Three.js](https://threejs.org).

**Controls:** WASD/arrows to run, Space to jump. Touch controls on mobile.

## ⚽ Pixel Pitch (`soccer/`)

A pixel-art 1v1 online soccer game. Pick your player, create a match, and
send the share link to a friend — first to 5 goals wins.

**Controls:** arrows/WASD move · Space steals the ball · Shift shoots.
Touch stick + buttons on mobile.

**Roster:** Ronaldo · Messi · Mbappé · Lamine · Luis Díaz · Neymar ·
Morgan · Rodman · Horan — all procedurally generated 12×16 pixel sprites.

Multiplayer is WebRTC via [PeerJS](https://peerjs.com) and its free public
broker — no game server. The host simulates the match; the guest streams
inputs.

### Connection troubleshooting

If the lobby says the players found each other but can't connect:

1. **VPN / office network** — if either player is on one, disconnect it and
   reload (symmetric NAT blocks direct WebRTC).
2. **Add a TURN relay** — create a free account at
   [metered.ca](https://www.metered.ca/stun-turn), then open the game with
   your credentials in the URL:

   ```
   soccer/index.html?turn=USERNAME:CREDENTIAL@standard.relay.metered.ca
   ```

   The setting is remembered in the browser and automatically included in
   the share link, so your opponent gets the relay too.

## Run locally

```sh
npx serve .
```

Then open the printed URL — or deploy the repo to any static host
(GitHub Pages works as-is).
