# ⚽ Pixel Pitch — 1v1 Online Soccer

A pixel-art 1v1 soccer game you play in the browser. Pick your player, create
a match, and send the share link to a friend — first to 5 goals wins.

## Play

Serve the folder statically and open `index.html`:

```sh
npx serve .
```

1. **Create Match** → pick your player → copy the share link.
2. Your opponent opens the link, picks their player, and the match kicks off.

Multiplayer uses WebRTC (via [PeerJS](https://peerjs.com) and its free public
broker) — no game server needed. The host simulates the match; the guest
streams inputs.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Move |
| Space | Steal the ball (tackle) |
| Shift | Shoot |

## Roster

Ronaldo · Messi · Mbappé · Lamine · Luis Díaz · Neymar · Morgan · Rodman · Horan

All sprites are procedurally generated 12×16 pixel art (`characters.js`).

## Files

- `index.html` — UI screens (menu, character select, lobby, game over)
- `characters.js` — roster + pixel sprite renderer
- `net.js` — PeerJS host/join + share links
- `game.js` — match simulation, netcode glue, canvas rendering
