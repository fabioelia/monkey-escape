// PeerJS (WebRTC) networking. Host creates a peer with a room-derived id;
// the guest opens the share link (?room=XXXX) and connects to it.

// Optional broker override (e.g. a self-hosted PeerServer):
//   window.PEERJS_OPTS = { host: 'localhost', port: 9000, path: '/' }
// Defaults to the free PeerJS cloud broker when unset.
const PEER_OPTS = () => window.PEERJS_OPTS || {};

const NET = {
  peer: null,
  conn: null,
  isHost: false,
  room: null,
  onData: null,
  onOpen: null,     // fired when the data channel is up
  onClose: null,
  onError: null,

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
    this.peer = new Peer(PEER_OPTS());
    this.peer.on('error', err => this.onError && this.onError(err));
    this.peer.on('open', () => {
      this.conn = this.peer.connect(this.peerId(room), { reliable: true });
      this._wire(this.conn);
    });
  },

  _wire(conn) {
    conn.on('open', () => this.onOpen && this.onOpen());
    conn.on('data', d => this.onData && this.onData(d));
    conn.on('close', () => this.onClose && this.onClose());
    conn.on('error', err => this.onError && this.onError(err));
  },

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj);
  },
};
