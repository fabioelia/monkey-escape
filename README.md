# 🕹️ F1V Arcade

Two browser games, no build step — static files only. The root `index.html`
is a launcher that picks between them.

## 🐵 Monkey Escape (`monkey/`)

A 3D treetop chase obby: play a monkey escaping a chimpanzee across six
treetop stages. Built with [Three.js](https://threejs.org).

**Controls:** WASD/arrows to run, Space to jump. Touch controls on mobile.

## ⚽ Pixel Pitch (`soccer/`)

A pixel-art 1v1 soccer game. Play online via share link or room code,
locally on one keyboard, or against the AI.

**Modes:** first to 5 goals, or timed 2:00 halves with golden goal ·
online 1v1 · local 2P · vs AI · extra viewers on the share link spectate.

**Controls:** arrows/WASD move · Space steals · hold Shift to charge a
shot, release to fire · X sprints (watch the stamina bar) · 1-4 emotes.
Local 2P: P1 = WASD/Q/E/F, P2 = arrows/Space/Shift/period.
Touch stick + buttons on mobile.

**On the pitch:** goalkeepers guard the middle — aim for the corners.
Power-ups spawn mid-field (⚡ speed boost, ❄ freeze the opponent).
Goals get celebrations, confetti, and a slow-mo replay. Win/loss records
per character are kept in your browser.

**Roster:** Ronaldo · Messi · Mbappé · Lamine · Luis Díaz · Neymar ·
Morgan · Rodman · Horan — procedurally generated 12×16 pixel sprites,
each with their own speed/shot/tackle/control stats.

Multiplayer is WebRTC via [PeerJS](https://peerjs.com) and its free public
broker — no game server. The host simulates the match; the guest streams
inputs. A dropped connection pauses the match for 20s so the opponent can
rejoin.

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
