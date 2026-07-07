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

## Troubleshooting connections

Multiplayer is peer-to-peer (WebRTC). If the lobby says the players found
each other but no network path connects them:

1. **VPN / office network** — if either player is on one, disconnect it and
   reload. This is the most common cause (symmetric NAT).
2. **Add a TURN relay** — create a free account at
   [metered.ca](https://www.metered.ca/stun-turn) (50 GB/month free), then
   open the game with your credentials in the URL:

   ```
   index.html?turn=USERNAME:CREDENTIAL@standard.relay.metered.ca
   ```

   The setting is remembered in the browser and automatically included in
   the share link, so your opponent gets the relay too.

## Roster

Ronaldo · Messi · Mbappé · Lamine · Luis Díaz · Neymar · Morgan · Rodman · Horan

All sprites are procedurally generated 12×16 pixel art (`characters.js`).

## Files

- `index.html` — UI screens (menu, character select, lobby, game over)
- `characters.js` — roster + pixel sprite renderer
- `net.js` — PeerJS host/join + share links
- `game.js` — match simulation, netcode glue, canvas rendering
