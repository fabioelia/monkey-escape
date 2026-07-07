// PeerJS (WebRTC) networking. Host creates a peer with a room-derived id;
// the guest opens the share link (?room=XXXX) and connects to it.

// Optional broker override (e.g. a self-hosted PeerServer):
//   window.PEERJS_OPTS = { host: 'localhost', port: 9000, path: '/' }
//
// TURN relay: STUN-only WebRTC fails between restrictive NATs (VPNs,
// corporate networks, some carriers) — ICE just hangs with no relay to
// fall back on. There is no reliable anonymous free TURN service, so we
// support plugging in your own credentials (e.g. a free metered.ca
// account) via the URL:
//   ?turn=USERNAME:CREDENTIAL@standard.relay.metered.ca
// The setting is remembered in localStorage and automatically carried
// into the share link so the other player uses the same relay.

const TURN_STORE_KEY = 'pixel-pitch-turn';

function currentTurn() {
  const fromUrl = new URLSearchParams(location.search).get('turn');
  if (fromUrl) { try { localStorage.setItem(TURN_STORE_KEY, fromUrl); } catch (e) {} return fromUrl; }
  try { return localStorage.getItem(TURN_STORE_KEY); } catch (e) { return null; }
}

function turnServer(spec) {
  const m = /^(.+):(.+)@([^@]+)$/.exec(spec || '');
  if (!m) return null;
  return {
    urls: [`turn:${m[3]}:80`, `turn:${m[3]}:443`, `turns:${m[3]}:443?transport=tcp`],
    username: m[1],
    credential: m[2],
  };
}

const PEER_OPTS = () => {
  if (window.PEERJS_OPTS) return window.PEERJS_OPTS;
  const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = turnServer(currentTurn());
  if (turn) ice.push(turn);
  return { config: { iceServers: ice } };
};

const NET = {
  peer: null,
  conn: null,
  isHost: false,
  room: null,
  onData: null,
  onOpen: null,     // fired when the data channel is up
  onClose: null,
  onError: null,
  onReady: null,    // host only: registered with the broker, link is joinable
  onRetry: null,    // guest only: host not found yet, retrying
  onIce: null,      // ICE connection state updates ('checking', 'connected', 'failed', …)
  onSpectatorOpen: null,  // host only: an extra viewer connected
  spectators: [],
  hasTurn: () => !!turnServer(currentTurn()),
  _attempts: 0,

  makeRoomCode() {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  },

  peerId(room) {
    return 'pixel-pitch-' + room;
  },

  shareLink(room) {
    const url = new URL(location.href);
    url.search = '?room=' + room;
    const turn = currentTurn();
    if (turn) url.searchParams.set('turn', turn);
    url.hash = '';
    return url.toString();
  },

  host(room) {
    this.isHost = true;
    this.room = room;
    this.peer = new Peer(this.peerId(room), PEER_OPTS());
    this.peer.on('open', () => this.onReady && this.onReady());
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) {} });
    this.peer.on('error', err => this.onError && this.onError(err));
    this.peer.on('connection', conn => {
      if (this.conn) {
        // room is full — extra connections become spectators
        this.spectators.push(conn);
        conn.on('open', () => this.onSpectatorOpen && this.onSpectatorOpen(conn));
        const drop = () => { this.spectators = this.spectators.filter(c => c !== conn); };
        conn.on('close', drop);
        conn.on('error', drop);
        return;
      }
      this.conn = conn;
      this.onGuestFound && this.onGuestFound();
      this._wire(conn);
    });
  },

  join(room) {
    this.isHost = false;
    this.room = room;
    this._attempts = 0;
    this._negFails = 0;
    this._retryTimer = null;
    this.peer = new Peer(PEER_OPTS());
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) {} });
    this.peer.on('error', err => {
      // The host may not be registered with the broker yet (still loading,
      // slow network) — keep retrying for ~30s before giving up.
      if (err.type === 'peer-unavailable') {
        this.conn = null;
        if (!this._scheduleRetry()) this.onError && this.onError(err);
      } else {
        this.onError && this.onError(err);
      }
    });
    this.peer.on('open', () => this._connectToHost());
  },

  _scheduleRetry() {
    if (this._retryTimer) return true;          // one retry already pending
    if (this._attempts >= 15) return false;
    this.onRetry && this.onRetry(this._attempts);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this._connectToHost();
    }, 1800);
    return true;
  },

  _connectToHost() {
    if (this.conn && this.conn.open) return;
    this._attempts++;
    this.conn = this.peer.connect(this.peerId(this.room), { reliable: true });
    this._wire(this.conn);
  },

  _wire(conn) {
    conn.on('open', () => { conn._up = true; clearTimeout(conn._watchdog); this.onOpen && this.onOpen(); });
    conn.on('data', d => this.onData && this.onData(d));
    conn.on('iceStateChanged', state => this.onIce && this.onIce(state));
    // A connection that dies BEFORE opening is a failed ICE negotiation —
    // retry it (guest) or free the slot (host). One that dies after opening
    // is a real disconnect.
    const fail = err => {
      clearTimeout(conn._watchdog);
      if (conn !== this.conn) return;           // stale connection, ignore
      if (conn._up) { this.conn = null; this.onClose && this.onClose(); return; }
      this.conn = null;
      if (this.isHost) {
        this.onGuestLost && this.onGuestLost();  // free the slot, keep waiting
        return;
      }
      // Identical ICE config rarely succeeds on a 4th try — give up with a
      // useful message after 3 failed negotiations.
      this._negFails = (this._negFails || 0) + 1;
      if (this._negFails >= 3 || !this._scheduleRetry()) {
        this.onError && this.onError(err || { type: 'connect-failed' });
      }
    };
    conn.on('close', () => fail());
    conn.on('error', err => fail(err));
    // ICE can hang in 'checking' forever with no close/error event — if the
    // channel isn't up within 12s, kill it so fail() can retry or report.
    conn._watchdog = setTimeout(() => {
      if (!conn._up) {
        try { conn.close(); } catch (e) {}
        fail({ type: 'connect-failed' });
      }
    }, 12000);
  },

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj);
  },

  // send to the opponent AND every spectator
  broadcast(obj) {
    this.send(obj);
    for (const c of this.spectators) if (c.open) c.send(obj);
  },

  // guest: try to re-establish a dropped match connection (host peer id unchanged)
  rejoin() {
    this._attempts = 0;
    this._negFails = 0;
    this._connectToHost();
  },
};
