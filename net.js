// PeerJS (WebRTC) networking. Host creates a peer with a room-derived id;
// the guest opens the share link (?room=XXXX) and connects to it.

// Optional broker override (e.g. a self-hosted PeerServer):
//   window.PEERJS_OPTS = { host: 'localhost', port: 9000, path: '/' }
// Defaults to the free PeerJS cloud broker + free STUN/TURN relays.
// TURN matters: without a relay, two players behind restrictive NATs
// (e.g. phone hotspot vs home wifi) fail ICE with "negotiation failed".
const PEER_OPTS = () => window.PEERJS_OPTS || {
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turns:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
  },
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
      if (this.conn) { conn.close(); return; } // room is full
      this.conn = conn;
      this._wire(conn);
    });
  },

  join(room) {
    this.isHost = false;
    this.room = room;
    this._attempts = 0;
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
    conn.on('open', () => { conn._up = true; this.onOpen && this.onOpen(); });
    conn.on('data', d => this.onData && this.onData(d));
    // A connection that dies BEFORE opening is a failed ICE negotiation —
    // retry it (guest) or free the slot (host). One that dies after opening
    // is a real disconnect.
    const fail = err => {
      if (conn !== this.conn) return;           // stale connection, ignore
      if (conn._up) { this.onClose && this.onClose(); return; }
      this.conn = null;
      if (!this.isHost && !this._scheduleRetry()) {
        this.onError && this.onError(err || { type: 'connect-failed' });
      }
    };
    conn.on('close', () => fail());
    conn.on('error', err => fail(err));
  },

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj);
  },
};
