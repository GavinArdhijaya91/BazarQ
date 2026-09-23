'use strict';

/* ============================================================
   BazarQ · Multi-booth serverless backend (Firebase RTDB)
   Tiap booth = namespace sendiri: bazarq/v2/booths/{slug}
   QR berisi URL penuh: {app}/#pembeli/{slug} → bisa di-scan
   siapa pun, tanpa server sendiri. Legacy bazarq/state tetap
   didukung sebagai booth "demo-geprek".
   ============================================================ */

firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.database();

const DEFAULT_SLUG = 'demo-geprek';
const K_BOOTH = 'bazarq.booth';
const PREP_MIN = 4;

const DEFAULT_MENU = [
  { id:'m1', name:'Ayam Geprek Level 5',   desc:'Nasi, lalapan, sambal bawang',   price:15000, active:true, icon:'geprek' },
  { id:'m2', name:'Paket Geprek + Es Teh', desc:'Nasi, ayam geprek, es teh jumbo', price:20000, active:true, icon:'paket' },
  { id:'m3', name:'Tahu Krispi (5 potong)',   desc:'Saus sambal kering',              price:8000,  active:true, icon:'tahu' },
  { id:'m4', name:'Es Teh Jumbo',          desc:'Teh tubruk manis dingin',         price:5000,  active:true, icon:'esteh' },
  { id:'m5', name:'Es Jeruk Peras',        desc:'Jeruk peras asli',                price:6000,  active:true, icon:'jeruk' },
];
const PIN_HASH_DEFAULT = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // sha256('1234')
const DEFAULT_PROFILE = { name:'Geprek Bintang', desc:'Booth contoh · Gelar Karya UNNES', pinHash:PIN_HASH_DEFAULT, qrisImageUrl:'' };

/* ---------- helpers ---------- */
const appEl = document.getElementById('app');
const $     = (s, el=document) => el.querySelector(s);
const $$    = (s, el=document) => Array.from(el.querySelectorAll(s));
async function sha256hex(s){
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch(e){ let h1=0xdeadbeef,h2=0x41c6ce57; const str=String(s); for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677);} h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909); h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909); return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0'); }
}
const rp    = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const pad2  = n => String(n).padStart(2,'0');
const pad3  = n => String(n).padStart(3,'0');
const tk    = id => 'A-' + pad3(id);
const hhmm  = t => new Date(t).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
const esc   = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maskPhone = p => { const d = String(p).replace(/\D/g,''); return d.length <= 6 ? d : d.slice(0,4) + '•••' + d.slice(-3); };
const mmss  = ms => { const s = Math.max(0, Math.floor(ms/1000)); return pad2(Math.floor(s/60)) + ':' + pad2(s%60); };
const slugify = s => String(s || 'booth').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32) || 'booth';

/* ---------- booth routing ---------- */
function boothFromUrl(){
  const q = new URLSearchParams(location.search).get('booth');
  if (q && /^[a-z0-9-]{2,50}$/.test(q)) return q;
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^(pembeli|order|merchant|tiket|ticket)\/([a-z0-9-]{2,50})/i);
  if (m) return m[2].toLowerCase();
  try { const s = sessionStorage.getItem(K_BOOTH); if (s) return s; } catch(e){}
  return DEFAULT_SLUG;
}
let SLUG = boothFromUrl();
try { sessionStorage.setItem(K_BOOTH, SLUG); } catch(e){}
const K_MY   = () => 'bazarq.myTicket.' + SLUG;
const K_AUTH = () => 'bazarq.merchantAuth.' + SLUG;
let stateRef = db.ref('bazarq/v2/booths/' + SLUG);

const MENU  = () => (S && Array.isArray(S.menu) ? S.menu : DEFAULT_MENU).filter(m => m.active !== false);
const MENU_ALL = () => (S && Array.isArray(S.menu) ? S.menu : DEFAULT_MENU);
const BOOTH = () => (S && S.profile) || DEFAULT_PROFILE;
const STORED_PIN_HASH = () => {
  const h = S && S.profile && S.profile.pinHash;
  return /^[0-9a-f]{64}$/i.test(String(h || '')) ? String(h).toLowerCase() : PIN_HASH_DEFAULT;
};
const appBase = () => {
  // QR harus bisa di-scan perangkat digital → URL publik. Kalau dibuka via localhost/IP lokal,
  // paksa basis produksi agar QR tetap membuka menu penjual di web.
  try {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h.indexOf('192.168.') === 0 || h.indexOf('10.') === 0) {
      if (window.DEMO_URL) return 'https://' + window.DEMO_URL + '/';
    }
  } catch(e){}
  return location.href.split('#')[0].split('?')[0];
};
const orderUrl   = (slug) => appBase() + '#pembeli/' + (slug || SLUG);
const merchantUrl= (slug) => appBase() + '#merchant/' + (slug || SLUG);
// Sub-peran merchant (fondasi lama tetap jalan: #merchant/{slug} = kasir).
// #merchant/{slug}/kasir = View B Kasir · /dapur = View C Dapur · /display = layar publik read-only.
const merchantKasirUrl = (slug) => appBase() + '#merchant/' + (slug || SLUG) + '/kasir';
const merchantDapurUrl = (slug) => appBase() + '#merchant/' + (slug || SLUG) + '/dapur';
const merchantDisplayUrl = (slug) => appBase() + '#merchant/' + (slug || SLUG) + '/display';
function merchantSub(){
  const h = location.hash.replace(/^#/, '').split('?')[0];
  const m = h.match(/^merchant\/[a-z0-9-]{2,50}\/(kasir|dapur|display)/i);
  return m ? m[1].toLowerCase() : '';
}
const ticketUrl  = (slug, id) => appBase() + '#tiket/' + (slug || SLUG) + '/' + id;
// Link tiket tersimpan: #tiket/{slug}/{id} → pulihkan tiket bila tab tertutup
function ticketIdFromUrl(){
  const h = location.hash.replace(/^#/, '').split('?')[0];
  const m = h.match(/^(tiket|ticket)\/[a-z0-9-]{2,50}\/(\d{1,4})/i);
  return m ? Number(m[2]) : 0;
}
function adoptTicketFromUrl(){
  const id = ticketIdFromUrl();
  if (id > 0 && S && S.orders.some(o => o.id === id)){
    addMyId(id);
    stage = 'ticket';
    reorderMode = false;
    return true;
  }
  return false;
}

/* ---------- state ---------- */
let S = null;
let sel = {};
let stage = 'scan';
let reorderMode = false;
let lastPhone = '';
let toastTimer = null;
let prevSeq = 0;
let myPresenceRef = null;
let boothMissing = false;
let lastRoute = '';

/* ---------- sound engine (hardened buat bazar berisik) ----------
   - ctx suspended saat event realtime datang → chime antre, dibunyikan di gestur pertama.
   - Pesanan siap = double-burst keras + getar + judul tab kedip (cadangan kalau kalah berisik). */
const BazarQAudio = {
  ctx: null, enabled: true, pending: null,
  init(){
    if (!this.ctx){ try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
    if (this.ctx && this.ctx.state === 'suspended'){ this.ctx.resume().catch(() => {}); }
  },
  unlock(){ this.init(); this.flush(); },
  flush(){
    if (!this.pending || !this.ctx || this.ctx.state !== 'running') return;
    const p = this.pending; this.pending = null;
    try { p(); } catch(e){}
  },
  _play(freqs, dur, vol = 0.22){
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx || this.ctx.state !== 'running'){ this.pending = () => this._play(freqs, dur, vol); return; }
      const now = this.ctx.currentTime;
      freqs.forEach((f, i) => {
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t0   = now + i * 0.13;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(t0); osc.stop(t0 + dur + 0.05);
      });
    } catch(e){}
  },
  buzz(pattern){
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e){}
  },
  playOrderReady(){ this._play([523.25, 659.25, 783.99], 0.45, 0.3); },
  playReadyAlert(){
    this._play([523.25, 659.25, 783.99, 1046.5], 0.5, 0.34);
    setTimeout(() => this._play([523.25, 659.25, 783.99, 1046.5], 0.5, 0.34), 950);
    this.buzz([180, 120, 220]);
  },
  playPing(){ this._play([880], 0.25, 0.2); },
  playNewOrder(){   this._play([880, 1108.73],           0.30); },
  toggle(){         this.enabled = !this.enabled; }
};
/* Judul tab ikut kedip saat pesanan siap (terlihat di laptop/proyektor walau suara kalah) */
let flashTimer = null;
const BASE_TITLE = document.title;
function flashTitle(msg){
  stopFlash();
  let on = false;
  flashTimer = setInterval(() => { on = !on; document.title = on ? msg : BASE_TITLE; }, 900);
  setTimeout(stopFlash, 60000);
}
function stopFlash(){
  if (flashTimer){ clearInterval(flashTimer); flashTimer = null; }
  if (document.title !== BASE_TITLE) document.title = BASE_TITLE;
}
document.addEventListener('pointerdown', stopFlash, { passive: true });
document.addEventListener('keydown', stopFlash);
document.addEventListener('visibilitychange', () => { if (!document.hidden) stopFlash(); });

/* ---------- state bersama & seed ---------- */
function freshState(profile, menu){ return { v:1, seq:0, kitchenFull:false, orders:[], log:[], profile: profile || DEFAULT_PROFILE, menu: menu || DEFAULT_MENU }; }
function pushLog(st, type, text, extra){
  st.log.unshift(Object.assign({ at:Date.now(), type, text }, extra || {}));
  st.log = st.log.slice(0, 40);
}
function seedState(st){
  const now = Date.now(), M = 60000;
  const menu = MENU_ALL();
  const mk = (id, minsAgo, status, phone, its, stamps) => {
    const items = its.map(pair => {
      const m = menu.find(x => x.id === pair[0]) || { id:pair[0], name:pair[0], price:0 };
      return { id:m.id, qty:pair[1], name:m.name, price:m.price };
    });
    return Object.assign({
      id, ticket:tk(id), phone, items, status,
      paid: status !== 'waiting', payMethod: (id % 2 ? 'qris' : 'cash'),
      total: items.reduce((a,i) => a + i.price * i.qty, 0),
      createdAt: now - minsAgo*M, wa2:true, waReady:true
    }, stamps || {});
  };
  st.seq = 7;
  st.orders = [
    mk(1, 96, 'completed', '081234567801', [['m2',1]], { processingAt:now-90*M, readyAt:now-82*M, completedAt:now-78*M }),
    mk(2, 70, 'completed', '081234567802', [['m1',1],['m4',1]], { processingAt:now-65*M, readyAt:now-58*M, completedAt:now-55*M }),
    mk(3, 12, 'processing','081298765403', [['m2',2]], { processingAt:now-8*M }),
    mk(4, 10, 'waiting',   '081277712344', [['m1',1]]),
    mk(5, 7,  'waiting',   '081566677885', [['m3',1],['m5',1]]),
    mk(6, 5,  'waiting',   '081211122236', [['m2',1],['m4',1]]),
    mk(7, 1,  'waiting',   '085799900117', [['m4',2]])
  ];
  st.log = [
    { at:now-1*M,  type:'new',     text:'A-007 masuk dari 0857•••117' },
    { at:now-30*M, type:'ok',      text:'A-002 selesai diambil.' },
    { at:now-35*M, type:'kitchen', text:'Dapur Penuh dimatikan. Pesanan baru diterima lagi.' },
    { at:now-55*M, type:'ok',      text:'A-001 selesai diambil.' }
  ];
}

/* ---------- Firebase save/load (hardened: debounce + sanitasi) ---------- */
let saveTimer = null, lastOrderAt = 0;
function sanitizeState(){
  if (!S) return;
  if (typeof S.seq !== 'number' || S.seq < 0) S.seq = 0;
  S.seq = Math.min(9999, Math.floor(S.seq));
  S.kitchenFull = !!S.kitchenFull;
  if (!Array.isArray(S.orders)) S.orders = [];
  if (S.orders.length > 200) S.orders = S.orders.slice(-200);
  if (!Array.isArray(S.log)) S.log = [];
  S.log = S.log.slice(0, 40);
  if (S.profile){
    S.profile.name = String(S.profile.name || '').slice(0, 60);
    S.profile.desc = String(S.profile.desc || '').slice(0, 120);
    if (S.profile.pin) delete S.profile.pin; // plaintext dilarang rules baru
    if (!/^[0-9a-f]{64}$/i.test(String(S.profile.pinHash || ''))) S.profile.pinHash = PIN_HASH_DEFAULT;
    else S.profile.pinHash = String(S.profile.pinHash).toLowerCase();
    let q = String(S.profile.qrisImageUrl || '').slice(0, 500);
    if (q && !/^https:\/\//i.test(q)) q = '';
    S.profile.qrisImageUrl = q;
  }
  if (Array.isArray(S.menu)) S.menu = S.menu.slice(0, 50);
}
function save(){
  if (!S || boothMissing) return;
  sanitizeState();
  S.v = (S.v || 0) + 1;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    stateRef.set(S).catch(e => { console.error('BazarQ save error:', e); toast('Gagal menyimpan. Periksa koneksi, lalu coba lagi.'); });
  }, 250);
}

function switchBooth(slug){
  slug = String(slug || DEFAULT_SLUG).toLowerCase();
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) slug = DEFAULT_SLUG;
  if (slug === SLUG && S) { renderAll(); return; }
  try { stateRef.off(); } catch(e){}
  try { if (myPresenceRef) { myPresenceRef.remove(); } } catch(e){}
  try { db.ref('bazarq/v2/presence/' + SLUG).off(); } catch(e){}
  SLUG = slug;
  try { sessionStorage.setItem(K_BOOTH, SLUG); } catch(e){}
  stateRef = db.ref('bazarq/v2/booths/' + SLUG);
  S = null; sel = {}; stage = 'scan'; reorderMode = false; boothMissing = false;
  load();
}

function load(){
  appEl.innerHTML =
    '<div class="loading-screen">' +
      '<div class="loading-spinner"></div>' +
      '<p style="color:var(--sky);font-size:.9rem;margin-top:12px">Menghubungkan ke booth <b class="mono">' + esc(SLUG) + '</b>…</p>' +
    '</div>';

  stateRef.once('value').then(async snap => {
    const val = snap.val();
    if (val && val.profile){
      S = val;
      // RTDB menghapus array kosong (booth baru: orders:[] tidak tersimpan) → normalisasi agar tidak dikira hilang
      if (!Array.isArray(S.orders)) S.orders = [];
      if (!Array.isArray(S.log)) S.log = [];
      if (!Array.isArray(S.menu) || !S.menu.length) S.menu = DEFAULT_MENU;
      // Migrasi PIN plaintext lama → pinHash (sekali, lalu save tanpa field pin)
      if (S.profile && S.profile.pin && !/^[0-9a-f]{64}$/i.test(String(S.profile.pinHash || ''))){
        try {
          S.profile.pinHash = await sha256hex(String(S.profile.pin));
        } catch(e){ S.profile.pinHash = PIN_HASH_DEFAULT; }
        delete S.profile.pin;
        sanitizeState(); S.v = (S.v || 0) + 1;
        stateRef.set(S).catch(() => {});
      } else if (S.profile && S.profile.pin){
        delete S.profile.pin;
      }
    } else if (SLUG === DEFAULT_SLUG){
      // Migrasi sekali dari booth legacy tunggal agar demo lama tidak hilang
      S = freshState();
      try {
        const leg = await db.ref('bazarq/state').once('value').then(s => s.val());
        if (leg && Array.isArray(leg.orders) && leg.orders.length){
          S.seq = leg.seq || leg.orders.length; S.orders = leg.orders; S.kitchenFull = !!leg.kitchenFull;
          S.log = Array.isArray(leg.log) ? leg.log : [];
        } else { seedState(S); }
      } catch(e){ seedState(S); }
      stateRef.set(S);
      db.ref('bazarq/v2/registry/' + SLUG).set({ name: S.profile.name, createdAt: Date.now() });
    } else {
      boothMissing = true;
      renderNotFound();
      return;
    }
    prevSeq = S.seq;
    stateRef.on('value', sn => {
      const next = sn.val();
      if (!next || typeof next.v !== 'number') return;
      if (!S || next.v !== S.v){ S = next; onSync(); }
    });

    adoptTicketFromUrl();
    if (myOrder() && myOrder().status !== 'completed') stage = 'ticket';
    checkNotifs();
    renderAll();
    setupPresence();
  }).catch(err => {
    console.error('BazarQ Firebase error:', err);
    appEl.innerHTML =
      '<div class="loading-screen"><p style="color:#DC2626;text-align:center;padding:24px">' +
      'Gagal terhubung.<br>Periksa koneksi internet, lalu refresh halaman.</p></div>';
  });
}

/* ---------- presence per booth ---------- */
function setupPresence(){
  try {
    const presRef = db.ref('bazarq/v2/presence/' + SLUG);
    myPresenceRef = presRef.push();
    myPresenceRef.onDisconnect().remove();
    myPresenceRef.set({ role: view(), at: Date.now() });
    presRef.on('value', snap => {
      const n = snap.numChildren();
      const el = document.getElementById('presenceCount');
      if (el) el.textContent = n + ' perangkat · ' + SLUG;
      const f = document.getElementById('presenceFoot');
      if (f) f.textContent = '· ' + n + ' perangkat terhubung';
    });
  } catch(e){}
}

function onSync(){
  if (!S) return;
  if (view() === 'merchant' && sessionStorage.getItem(K_AUTH()) === '1' && S.seq > prevSeq){
    BazarQAudio.playNewOrder();
  }
  prevSeq = S.seq;
  checkNotifs();
  if (view() === 'pembeli' && stage === 'menu'){ refreshMenuGate(); return; }
  renderAll();
}

/* ---------- QR: asli (qrcodejs) + fallback pola ---------- */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function qrFallbackSVG(size){
  size = size || 168;
  const N = 21, R = mulberry32(7);
  const inFinder = (x,y) => (x < 7 && y < 7) || (x >= N-7 && y < 7) || (x < 7 && y >= N-7);
  let rects = '';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    if (inFinder(x,y)) continue;
    if (R() < .44) rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
  }
  const finder = (fx,fy) =>
    '<rect x="' + fx + '" y="' + fy + '" width="7" height="7" fill="#0F172A"/>' +
    '<rect x="' + (fx+1) + '" y="' + (fy+1) + '" width="5" height="5" fill="#fff"/>' +
    '<rect x="' + (fx+2) + '" y="' + (fy+2) + '" width="3" height="3" fill="#0F172A"/>';
  return '<svg viewBox="0 0 ' + N + ' ' + N + '" width="' + size + '" height="' + size + '" role="img" ' +
    'aria-label="Pola QR simulasi" shape-rendering="crispEdges" fill="#0F172A">' +
    rects + finder(0,0) + finder(N-7,0) + finder(0,N-7) + '</svg>';
}
/** Render QR ASLI yang bisa di-scan kamera digital menuju URL order booth. */
function renderRealQR(el, text, size){
  if (!el) return;
  el.innerHTML = '';
  try {
    if (window.QRCode){
      new QRCode(el, { text: text, width: size || 168, height: size || 168, correctLevel: QRCode.CorrectLevel.M });
      el.setAttribute('data-qr', text);
      return;
    }
  } catch(e){}
  el.innerHTML = qrFallbackSVG(size);
}
function showQRFullscreen(){
  BazarQAudio.init();
  const url = orderUrl();
  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay'; overlay.id = 'qrOverlay';
  overlay.innerHTML =
    '<button class="btn btn-ghost btn-sm btn-close-qr" id="btnCloseQR">Tutup &times;</button>' +
    '<p class="qr-big-title">Scan untuk Memesan</p>' +
    '<p class="qr-big-sub">' + esc(BOOTH().name) + ' &middot; BazarQ</p>' +
    '<div class="qr-big-svg" id="qrFullBox"></div>' +
    '<p class="qr-url">' + esc(url) + '</p>' +
    '<p class="qr-hint">Scan pakai kamera digital, tanpa aplikasi. Tekan Tutup atau <kbd>Esc</kbd> untuk kembali.</p>';
  document.body.appendChild(overlay);
  renderRealQR($('#qrFullBox', overlay), url, 220);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', escH); };
  const escH  = e => { if (e.key === 'Escape') close(); };
  $('#btnCloseQR', overlay).addEventListener('click', close);
  document.addEventListener('keydown', escH);
}

/* ---------- ilustrasi 2D flat inline (tanpa network, <2KB per scene) ----------
   Palet ikut tema kertas hangat: biru sambal, kunyit, daun, tinta.
   Karakter tanpa wajah detail, gaya flat ala unDraw/Storyset. */
function illusHero(){
  return '<svg viewBox="0 0 320 210" role="img" aria-label="Ilustrasi booth bazar dengan antrean pembeli">' +
    '<circle cx="282" cy="32" r="13" fill="#FBEFD4" stroke="#6E5106" stroke-width="3"/>' +
    '<line x1="14" y1="180" x2="306" y2="180" stroke="#E4D8C2" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="160" y1="172" x2="302" y2="172" stroke="#1A56C4" stroke-width="2" stroke-dasharray="5 5" opacity=".55"/>' +
    '<rect x="36" y="58" width="5" height="122" rx="2" fill="#241B12"/>' +
    '<rect x="149" y="58" width="5" height="122" rx="2" fill="#241B12"/>' +
    '<rect x="28" y="44" width="136" height="12" rx="6" fill="#1A56C4"/>' +
    '<circle cx="39" cy="60" r="7" fill="#1A56C4"/><circle cx="61" cy="60" r="7" fill="#FDF8EE" stroke="#E4D8C2" stroke-width="2"/>' +
    '<circle cx="83" cy="60" r="7" fill="#1A56C4"/><circle cx="105" cy="60" r="7" fill="#FDF8EE" stroke="#E4D8C2" stroke-width="2"/>' +
    '<circle cx="127" cy="60" r="7" fill="#1A56C4"/><circle cx="149" cy="60" r="7" fill="#FDF8EE" stroke="#E4D8C2" stroke-width="2"/>' +
    '<rect x="42" y="106" width="26" height="15" rx="4" fill="#241B12"/>' +
    '<path d="M50 100 q3 -6 0 -12 M60 100 q-3 -6 0 -12" stroke="#6B5D4C" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="100" cy="102" r="11" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="89" y="86" width="22" height="8" rx="4" fill="#1A56C4"/>' +
    '<rect x="88" y="112" width="24" height="16" rx="6" fill="#1A56C4"/>' +
    '<rect x="34" y="122" width="120" height="58" rx="8" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="66" y="132" width="52" height="22" rx="6" fill="#1A56C4"/>' +
    '<text x="92" y="147" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="#FFF6EC">B</text>' +
    '<rect x="136" y="96" width="17" height="21" rx="2" fill="#fff" stroke="#241B12" stroke-width="2"/>' +
    '<rect x="139" y="99" width="5" height="5" fill="#1A56C4"/><rect x="145" y="99" width="5" height="5" fill="#1A56C4"/>' +
    '<rect x="139" y="105" width="5" height="5" fill="#1A56C4"/><rect x="145" y="105" width="11" height="3" fill="#E4D8C2"/>' +
    '<line x1="144" y1="117" x2="144" y2="122" stroke="#241B12" stroke-width="2"/>' +
    '<circle cx="196" cy="148" r="9" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="187" y="156" width="18" height="24" rx="8" fill="#1A56C4"/>' +
    '<rect x="205" y="150" width="15" height="19" rx="2" fill="#fff" stroke="#241B12" stroke-width="2"/>' +
    '<text x="212" y="163" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#1A56C4">A</text>' +
    '<circle cx="240" cy="148" r="9" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="231" y="156" width="18" height="24" rx="8" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="249" y="150" width="15" height="19" rx="2" fill="#fff" stroke="#241B12" stroke-width="2"/>' +
    '<text x="256" y="163" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#6E5106">A</text>' +
    '<circle cx="284" cy="148" r="9" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="275" y="156" width="18" height="24" rx="8" fill="#24512F"/>' +
    '<rect x="293" y="150" width="15" height="19" rx="2" fill="#fff" stroke="#241B12" stroke-width="2"/>' +
    '<text x="300" y="163" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#24512F">A</text>' +
  '</svg>';
}
function illusEmpty(){
  return '<svg viewBox="0 0 200 120" role="img" aria-label="Ilustrasi booth sepi, belum ada antrean">' +
    '<line x1="10" y1="104" x2="190" y2="104" stroke="#E4D8C2" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="18" y="30" width="64" height="8" rx="4" fill="#1A56C4"/>' +
    '<rect x="20" y="38" width="4" height="66" fill="#241B12"/><rect x="76" y="38" width="4" height="66" fill="#241B12"/>' +
    '<rect x="18" y="66" width="64" height="38" rx="6" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="36" y="74" width="28" height="13" rx="4" fill="#1A56C4"/>' +
    '<text x="50" y="84" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#FFF6EC">B</text>' +
    '<circle cx="112" cy="60" r="8" fill="none" stroke="#E4D8C2" stroke-width="3" stroke-dasharray="4 4"/>' +
    '<circle cx="142" cy="60" r="8" fill="none" stroke="#E4D8C2" stroke-width="3" stroke-dasharray="4 4"/>' +
    '<circle cx="170" cy="52" r="9" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="161" y="60" width="18" height="24" rx="8" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="179" y="54" width="14" height="17" rx="2" fill="#fff" stroke="#241B12" stroke-width="2"/>' +
    '<text x="186" y="66" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#6E5106">A</text>' +
  '</svg>';
}
function illusScan(){
  return '<svg viewBox="0 0 220 112" role="img" aria-label="Ilustrasi scan QR booth dengan perangkat digital">' +
    '<line x1="10" y1="100" x2="210" y2="100" stroke="#E4D8C2" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="14" y="34" width="56" height="7" rx="3.5" fill="#1A56C4"/>' +
    '<rect x="16" y="41" width="4" height="59" fill="#241B12"/><rect x="64" y="41" width="4" height="59" fill="#241B12"/>' +
    '<rect x="14" y="64" width="56" height="36" rx="6" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="28" y="71" width="28" height="13" rx="4" fill="#1A56C4"/>' +
    '<text x="42" y="81" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#FFF6EC">B</text>' +
    '<rect x="140" y="12" width="52" height="84" rx="10" fill="#241B12"/>' +
    '<rect x="146" y="20" width="40" height="60" rx="4" fill="#fff"/>' +
    '<rect x="151" y="25" width="12" height="12" fill="#241B12"/><rect x="165" y="25" width="12" height="12" fill="#241B12"/>' +
    '<rect x="151" y="39" width="12" height="12" fill="#241B12"/><rect x="165" y="39" width="8" height="4" fill="#1A56C4"/><rect x="165" y="45" width="12" height="6" fill="#E4D8C2"/>' +
    '<rect x="151" y="53" width="26" height="5" fill="#1A56C4"/><rect x="151" y="60" width="18" height="5" fill="#E4D8C2"/>' +
    '<line x1="96" y1="52" x2="140" y2="52" stroke="#E8A33D" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>' +
    '<circle cx="158" cy="88" r="3" fill="#1A56C4"/>' +
  '</svg>';
}

function illusHandoff(){
  return '<svg viewBox="0 0 240 130" role="img" aria-label="Ilustrasi penyerahan pesanan dengan tiket">' +
    '<line x1="10" y1="116" x2="230" y2="116" stroke="#E4D8C2" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="16" y="34" width="72" height="8" rx="4" fill="#1A56C4"/>' +
    '<rect x="18" y="42" width="4" height="74" fill="#241B12"/><rect x="82" y="42" width="4" height="74" fill="#241B12"/>' +
    '<rect x="16" y="74" width="72" height="42" rx="6" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
    '<circle cx="52" cy="56" r="10" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="42" y="42" width="20" height="7" rx="3.5" fill="#1A56C4"/>' +
    '<rect x="40" y="64" width="24" height="14" rx="6" fill="#1A56C4"/>' +
    '<rect x="96" y="58" width="34" height="44" rx="4" fill="#fff" stroke="#241B12" stroke-width="3"/>' +
    '<text x="113" y="76" text-anchor="middle" font-family="monospace" font-size="13" font-weight="bold" fill="#1A56C4">A-007</text>' +
    '<text x="113" y="90" text-anchor="middle" font-family="monospace" font-size="8" fill="#6B5D4C">SIAP</text>' +
    '<circle cx="196" cy="52" r="10" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<rect x="185" y="61" width="22" height="30" rx="9" fill="#24512F"/>' +
    '<rect x="168" y="72" width="24" height="20" rx="4" fill="#FBEFD4" stroke="#241B12" stroke-width="3"/>' +
    '<path d="M172 72 q4 -6 8 0" stroke="#241B12" stroke-width="2.5" fill="none"/>' +
    '<path d="M141 66 l-6 -8 M141 66 l8 -6" stroke="#24512F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';
}

/* Umbul-umbul penyambut ala spanduk pintu masuk bazar: tali + bendera segitiga
   palet BazarQ, membentang penuh barat→timur. Geometris sederhana sesuai skill. */
function illusGarland(){
  const W = 1200, N = 26;
  const cols = ['#2563EB', '#60A5FA', '#F97316', '#10B981', '#1E40AF', '#FBEFD4'];
  const y = x => 26 + 62 * Math.sin(Math.PI * x / W);
  let flags = '';
  for (let i = 0; i < N; i++){
    const x = 30 + i * (W - 60) / (N - 1);
    const yy = y(x), c = cols[i % cols.length];
    flags += '<polygon points="' + (x - 15) + ',' + yy.toFixed(1) + ' ' + (x + 15) + ',' + yy.toFixed(1) + ' ' + x + ',' + (yy + 36).toFixed(1) + '" fill="' + c + '" stroke="#0F172A" stroke-width="3" stroke-linejoin="round"/>';
  }
  let d = '';
  for (let x = 0; x <= W; x += 40){ d += (x === 0 ? 'M' : 'L') + x + ',' + y(x).toFixed(1); }
  return '<svg viewBox="0 0 ' + W + ' 140" role="img" aria-label="Umbul-umbul penyambut booth UMKM">' +
    '<path d="' + d + '" fill="none" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/>' + flags + '</svg>';
}

/* ---------- tur interaktif 1 menit (pengunjung baru) ---------- */
const TOUR_STEPS = [
  { t:'Pindai QR di booth', d:'Arahkan kamera digital ke QR standee. Halaman pemesanan langsung terbuka, tanpa pasang aplikasi, tanpa buat akun.', img:'scan', cta:['Buka halaman pembeli', 'pembeli'] },
  { t:'Pilih menu, tiket terbit', d:'Tandai menu, isi nomor WhatsApp, kirim. Nomor antrean (mis. A-007) dan estimasi tunggu langsung tampil.', img:'hero', cta:['Coba pesan sekarang', 'pembeli'] },
  { t:'Bayar di kasir, bebas jelajah', d:'Pilih QRIS atau tunai. Penjual menekan Konfirmasi Lunas, pesanan diteruskan ke dapur. Notifikasi masuk saat tinggal 2 antrean.', img:'scan', cta:['Lihat dasbor penjual', 'merchant'] },
  { t:'Tunjukkan tiket, bawa pulang', d:'Status berubah Siap Diambil. Tunjukkan tiket ke booth, pesanan diserahkan, selesai.', img:'handoff', cta:['Mulai sebagai pembeli', 'pembeli'] }
];
const tourImg = k => k === 'hero' ? illusHero() : k === 'handoff' ? illusHandoff() : illusScan();
let tourIdx = 0;
function startTour(){
  BazarQAudio.unlock();
  tourIdx = 0;
  closeTour(false);
  const ov = document.createElement('div');
  ov.className = 'tour-overlay'; ov.id = 'tourOverlay';
  ov.innerHTML =
    '<div class="tour-card" role="dialog" aria-label="Tur interaktif BazarQ">' +
      '<div class="tour-illus" id="tourImg"></div>' +
      '<p class="tour-step" id="tourStep"></p>' +
      '<h3 id="tourTitle"></h3>' +
      '<p class="tour-desc" id="tourDesc"></p>' +
      '<div class="tour-dots" id="tourDots"></div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost btn-sm" id="tourBack" type="button">Kembali</button>' +
        '<button class="btn btn-ghost btn-sm" id="tourSkip" type="button">Lewati</button>' +
        '<button class="btn btn-primary btn-sm" id="tourNext" type="button">Lanjut</button>' +
      '</div>' +
      '<div class="btn-row"><a class="btn btn-ghost btn-sm wide" id="tourCta" href="#">Coba langsung</a></div>' +
    '</div>';
  document.body.appendChild(ov);
  const paint = () => {
    const s = TOUR_STEPS[tourIdx];
    $('#tourImg').innerHTML = tourImg(s.img);
    $('#tourStep').textContent = 'Langkah ' + (tourIdx + 1) + ' dari ' + TOUR_STEPS.length;
    $('#tourTitle').textContent = s.t;
    $('#tourDesc').textContent = s.d;
    $('#tourDots').innerHTML = TOUR_STEPS.map((_, i) => '<span class="tour-dot' + (i === tourIdx ? ' on' : '') + '"></span>').join('');
    $('#tourBack').disabled = tourIdx === 0;
    $('#tourNext').textContent = tourIdx === TOUR_STEPS.length - 1 ? 'Selesai' : 'Lanjut';
    const cta = $('#tourCta');
    cta.textContent = s.cta[0] + ' →';
    cta.href = '#' + s.cta[1] + '/' + SLUG;
    cta.onclick = () => closeTour(true);
  };
  $('#tourBack').addEventListener('click', () => { if (tourIdx > 0){ tourIdx -= 1; paint(); } });
  $('#tourSkip').addEventListener('click', () => closeTour(true));
  $('#tourNext').addEventListener('click', () => {
    if (tourIdx < TOUR_STEPS.length - 1){ tourIdx += 1; paint(); }
    else closeTour(true);
  });
  ov.addEventListener('click', e => { if (e.target === ov) closeTour(true); });
  paint();
}
function closeTour(done){
  const ov = document.getElementById('tourOverlay');
  if (ov) ov.remove();
  if (done){ try { localStorage.setItem('bazarq.tourDone', '1'); } catch(e){} }
}
function maybeAutoTour(){
  try {
    if (localStorage.getItem('bazarq.tourDone')) return;
    if (sessionStorage.getItem('bazarq.tourShown')) return;
    sessionStorage.setItem('bazarq.tourShown', '1');
    setTimeout(() => { if (view() === 'beranda' && !document.getElementById('tourOverlay')) startTour(); }, 900);
  } catch(e){}
}

/* ---------- ikon makanan SVG per menu (ringan, ala katalog production) ---------- */
function foodIconFor(m){
  const key = String((m && (m.icon || m.id || '')) + ' ' + (m && m.name || '')).toLowerCase();
  if (key.includes('teh')) return 'esteh';
  if (key.includes('jeruk')) return 'jeruk';
  if (key.includes('tahu')) return 'tahu';
  if (key.includes('paket')) return 'paket';
  if (key.includes('geprek') || key.includes('ayam')) return 'geprek';
  return 'default';
}
function foodIcon(k){
  const P = {
    geprek: '<ellipse cx="32" cy="46" rx="24" ry="8" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
      '<ellipse cx="32" cy="38" rx="12" ry="8" fill="#fff" stroke="#E4D8C2" stroke-width="2"/>' +
      '<path d="M24 34 q6 -10 16 -6 q6 3 2 10 q-8 6 -16 2 q-4 -3 -2 -6z" fill="#E8A33D" stroke="#241B12" stroke-width="2.5"/>' +
      '<circle cx="42" cy="32" r="5" fill="#C0392B" stroke="#241B12" stroke-width="2"/>' +
      '<ellipse cx="20" cy="42" rx="6" ry="3.5" fill="#24512F"/>',
    paket: '<ellipse cx="24" cy="46" rx="17" ry="7" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
      '<ellipse cx="24" cy="39" rx="8" ry="5.5" fill="#fff" stroke="#E4D8C2" stroke-width="2"/>' +
      '<path d="M18 36 q4 -7 11 -4 q4 2 1 7 q-6 4 -11 1 q-2 -2 -1 -4z" fill="#E8A33D" stroke="#241B12" stroke-width="2"/>' +
      '<path d="M44 28 h12 l-2 22 h-8z" fill="#FBEFD4" stroke="#241B12" stroke-width="2.5"/>' +
      '<rect x="45" y="31" width="10" height="12" fill="#E8A33D"/>' +
      '<line x1="52" y1="28" x2="56" y2="18" stroke="#1A56C4" stroke-width="2.5" stroke-linecap="round"/>',
    tahu: '<rect x="12" y="34" width="16" height="14" rx="4" fill="#E8A33D" stroke="#241B12" stroke-width="2.5"/>' +
      '<rect x="30" y="30" width="16" height="14" rx="4" fill="#F2C063" stroke="#241B12" stroke-width="2.5"/>' +
      '<rect x="21" y="20" width="16" height="14" rx="4" fill="#E8A33D" stroke="#241B12" stroke-width="2.5"/>' +
      '<ellipse cx="50" cy="44" rx="9" ry="6" fill="#fff" stroke="#241B12" stroke-width="2.5"/>' +
      '<ellipse cx="50" cy="42" rx="5" ry="3" fill="#C0392B"/>',
    esteh: '<path d="M22 16 h20 l-3 34 h-14z" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
      '<path d="M24 24 h16 l-2 24 h-12z" fill="#E8A33D"/>' +
      '<rect x="27" y="28" width="6" height="6" rx="1" fill="#fff" opacity=".85" transform="rotate(15 30 31)"/>' +
      '<rect x="34" y="34" width="6" height="6" rx="1" fill="#fff" opacity=".85" transform="rotate(-12 37 37)"/>' +
      '<line x1="36" y1="16" x2="42" y2="6" stroke="#1A56C4" stroke-width="3" stroke-linecap="round"/>',
    jeruk: '<circle cx="22" cy="24" r="11" fill="#E8862D" stroke="#241B12" stroke-width="3"/>' +
      '<path d="M22 24 m-5 0 a5 5 0 0 0 10 0" stroke="#B95A12" stroke-width="2" fill="none"/>' +
      '<ellipse cx="30" cy="13" rx="5" ry="2.5" fill="#24512F" transform="rotate(-20 30 13)"/>' +
      '<path d="M42 22 h12 l-2 26 h-8z" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
      '<path d="M44 28 h8 l-1 18 h-6z" fill="#E8862D"/>' +
      '<line x1="50" y1="22" x2="54" y2="12" stroke="#1A56C4" stroke-width="2.5" stroke-linecap="round"/>',
    def: '<path d="M10 44 a22 22 0 0 1 44 0" fill="#FDF8EE" stroke="#241B12" stroke-width="3"/>' +
      '<circle cx="32" cy="18" r="3" fill="#1A56C4"/>' +
      '<line x1="6" y1="46" x2="58" y2="46" stroke="#241B12" stroke-width="3" stroke-linecap="round"/>'
  };
  return '<svg viewBox="0 0 64 64" role="img" aria-hidden="true">' + (P[k] || P.def) + '</svg>';
}

/* ---------- toast ---------- */
function toast(msg){
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4400);
}

/* ---------- turunan state ---------- */
const activeOrders = () => S.orders
  .filter(o => o.status === 'waiting' || o.status === 'processing')
  .sort((a,b) => a.createdAt - b.createdAt);
const posOf      = o => activeOrders().findIndex(x => x.id === o.id) + 1;
const activeCount = () => activeOrders().length;

function estMinFor(o){
  if (o.status === 'ready') return 0;
  if (o.status === 'processing') return PREP_MIN;
  const m = posOf(o) * PREP_MIN;
  return S.kitchenFull ? m + 15 : m;
}
const estLabel = o => o.status === 'ready' ? 'Siap' : '±' + estMinFor(o) + ' mnt';
const completed = () => S.orders.filter(o => o.status === 'completed');
const revenue   = () => completed().reduce((a,o) => a + o.total, 0);
function avgMins(){
  const c = completed();
  if (!c.length) return null;
  return Math.round(c.reduce((a,o) => a + ((o.completedAt || Date.now()) - o.createdAt), 0) / c.length / 60000);
}
function getMyIds(){
  try {
    const raw = sessionStorage.getItem(K_MY()) || '';
    if (raw.trim().startsWith('[')){
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(Number).filter(n => n > 0);
    }
    const single = Number(raw || 0);
    return single > 0 ? [single] : [];
  } catch(e){ return []; }
}
function addMyId(id){
  try {
    const ids = getMyIds();
    if (!ids.includes(id)) ids.push(id);
    sessionStorage.setItem(K_MY(), JSON.stringify(ids.slice(-10)));
  } catch(e){}
}
function myOrders(){
  const ids = getMyIds();
  if (!ids.length) return [];
  return ids.map(id => S.orders.find(o => o.id === id)).filter(Boolean);
}
function myOrder(){
  // Kompatibel data lama (string "7") + data baru (JSON "[7,8]"): tiket terbaru yg masih ada.
  const list = myOrders();
  if (list.length) return list[list.length - 1];
  try {
    const id = Number(sessionStorage.getItem(K_MY()) || 0);
    return S.orders.find(o => o.id === id) || null;
  } catch(e){ return null; }
}
function elapsedLabel(o){
  if (o.status === 'completed') return hhmm(o.completedAt) + ' selesai';
  if (o.status === 'ready')     return 'siap ' + hhmm(o.readyAt);
  return mmss(Date.now() - (o.processingAt || o.createdAt));
}

/* ---------- aksi (alur PRD Opsi 1: Static QRIS & Cash) ----------
   waiting = Menunggu Pembayaran (belum lunas)
   kasir Konfirmasi Lunas -> processing (Diproses Dapur)
   dapur Siap -> ready -> completed */
function createOrder(phone, payMethod){
  // Rate-limit anti-spam + batas qty agar 1 device tidak membanjiri dapur
  const now = Date.now();
  if (now - lastOrderAt < 5000){ toast('Tunggu sebentar sebelum pesan lagi.'); return null; }
  if (!/^(08\d{8,11}|628\d{8,11})$/.test(String(phone).replace(/\D/g,'')) && phone !== 'walk-in') return null;
  payMethod = payMethod === 'qris' ? 'qris' : 'cash';
  const menu = MENU();
  const items = Object.entries(sel).filter(([,q]) => q > 0).map(([mid,qty]) => {
    const m = menu.find(x => x.id === mid);
    if (!m) return null;
    qty = Math.max(1, Math.min(10, Math.floor(Number(qty) || 1)));
    return { id:String(mid).slice(0,12), qty, name:String(m.name).slice(0,60), price:Math.max(0, Math.min(1000000, Number(m.price) || 0)) };
  }).filter(Boolean);
  if (!items.length || items.length > 10) return null;
  const totalQty = items.reduce((a,i) => a + i.qty, 0);
  if (totalQty > 20){ toast('Maksimal 20 potong per pesanan.'); return null; }
  lastOrderAt = now;
  S.seq += 1;
  const o = {
    id:S.seq, ticket:tk(S.seq), phone, items,
    total:items.reduce((a,i) => a + i.price * i.qty, 0),
    status:'waiting', paid:false, payMethod: payMethod || 'cash',
    createdAt:Date.now(), wa2:false, waReady:false
  };
  S.orders.push(o);
  pushLog(S, 'new', o.ticket + ' masuk dari ' + maskPhone(phone) + ' (' + (o.payMethod === 'qris' ? 'QRIS' : 'Tunai') + ')');
  save();
  addMyId(o.id);
  reorderMode = false;
  return o;
}

function confirmPaid(id){
  const o = S.orders.find(x => x.id === id);
  if (!o || o.paid || o.status !== 'waiting') return;
  o.paid = true;
  o.status = 'processing';
  o.processingAt = Date.now();
  pushLog(S, 'proc', o.ticket + ' lunas dikonfirmasi kasir → diteruskan ke dapur.');
  save();
}

const FLOW_ORDER = { waiting:0, processing:1, ready:2, completed:3 };
function setStatus(id, status){
  const o = S.orders.find(x => x.id === id);
  if (!o || o.status === status) return;
  // Guard alur maju satu langkah (kasir tidak bisa loncat/mundur status)
  if (!(status in FLOW_ORDER) || FLOW_ORDER[status] !== FLOW_ORDER[o.status] + 1) return;
  if (o.status === 'waiting' && !o.paid) return; // waiting→processing hanya via Konfirmasi Lunas
  o.status = status;
  if (status === 'processing'){ o.processingAt = Date.now(); pushLog(S, 'proc', o.ticket + ' sedang diproses dapur.'); }
  if (status === 'ready'){      o.readyAt = Date.now();      pushLog(S, 'wa',   'Pesanan ' + o.ticket + ' sudah siap. Tunjukkan tiket ke booth, ya!', { phone:o.phone, ticket:o.ticket }); }
  if (status === 'completed'){  o.completedAt = Date.now();  pushLog(S, 'ok',   o.ticket + ' selesai diambil.'); }
  save();
}

function toggleKitchen(){
  S.kitchenFull = !S.kitchenFull;
  pushLog(S, 'kitchen', S.kitchenFull
    ? 'Dapur Penuh dinyalakan. Estimasi tiket baru +15 menit.'
    : 'Dapur Penuh dimatikan. Estimasi kembali normal.');
  save();
}

function resetDemo(){
  if (!window.confirm('Atur ulang booth ' + SLUG + '? Semua antrean di semua perangkat ikut terhapus.')) return;
  try {
    sessionStorage.removeItem(K_MY());
    sessionStorage.removeItem(K_AUTH());
  } catch(e){}
  const keepProfile = S.profile, keepMenu = S.menu;
  S = freshState(keepProfile, keepMenu);
  if (SLUG === DEFAULT_SLUG) seedState(S);
  sel = {}; stage = 'scan'; lastPhone = '';
  prevSeq = S.seq;
  save(); renderAll(); toast('Booth ' + SLUG + ' diatur ulang. Semua perangkat di booth ini ikut diatur ulang.');
}

async function createBooth(name, pin, desc){
  name = String(name || '').trim().slice(0, 40);
  desc = String(desc || '').trim().slice(0, 80);
  pin = String(pin || '').trim();
  if (name.length < 3) throw new Error('nama pendek');
  if (!/^\d{4,6}$/.test(pin)) throw new Error('pin salah');
  const slug = slugify(name) + '-' + Date.now().toString(36);
  const profile = { name: name, desc: desc || 'Booth UMKM BazarQ', pinHash: await sha256hex(pin), qrisImageUrl: '', createdAt: Date.now() };
  const booth = freshState(profile, DEFAULT_MENU.map(m => Object.assign({}, m)));
  booth.log = [{ at: Date.now(), type:'ok', text:'Booth ' + name + ' dibuat. Selamat berjualan!' }];
  await db.ref('bazarq/v2/registry/' + slug).set({ name: name, createdAt: Date.now() });
  await db.ref('bazarq/v2/booths/' + slug).set(booth);
  return slug;
}

function checkNotifs(){
  const o = myOrder();
  if (!o) return;
  if (!o.wa2 && o.status === 'waiting'){
    const p = posOf(o);
    if (p <= 2){
      o.wa2 = true;
      pushLog(S, 'wa', 'Antrean ' + o.ticket + ' tinggal ' + p + ' nomor lagi. Persiapan ke booth, ya!', { phone:o.phone, ticket:o.ticket });
      save();
      toast('Simulasi WhatsApp: antrean tinggal ' + p + ' nomor lagi.');
      BazarQAudio.playPing();
    }
  }
  if (!o.waReady && o.status === 'ready'){
    o.waReady = true; save();
    BazarQAudio.playReadyAlert();
    flashTitle('Pesanan ' + o.ticket + ' siap diambil!');
    toast('Simulasi WhatsApp: pesanan ' + o.ticket + ' siap diambil!');
  }
}

/* ---------- router multi-booth ---------- */
const VIEWS = { beranda:renderLanding, pembeli:renderPembeli, order:renderPembeli, merchant:renderMerchant, eo:renderEO, daftar:renderDaftar };
function view(){
  const h = location.hash.replace(/^#/, '').split('?')[0];
  const v = h.split('/')[0].toLowerCase();
  const alias = { order:'pembeli', tiket:'pembeli', ticket:'pembeli' };
  const norm = alias[v] || v;
  return VIEWS[norm] ? norm : 'beranda';
}
function renderNotFound(){
  appEl.innerHTML =
  '<section class="view buyer-wrap"><div class="panel">' +
    '<h2 class="menu-title">Booth <span class="mono">' + esc(SLUG) + '</span> tidak ditemukan</h2>' +
    '<p class="tiny" style="margin:0 0 16px">Mungkin QR kedaluwarsa atau kode booth salah ketik. Buat booth baru gratis, atau lihat booth contoh.</p>' +
    '<div class="btn-row"><a class="btn btn-primary" href="#daftar">Buat Booth Baru</a>' +
    '<a class="btn btn-ghost" href="#pembeli/' + DEFAULT_SLUG + '">Lihat Contoh</a></div>' +
  '</div></section>';
}
function renderAll(){
  // Transisi halaman: hanya saat rute (view/slug/hash) berubah, bukan saat sync data
  const rk = (boothMissing ? 'missing' : view()) + '|' + SLUG + '|' + location.hash;
  if (rk !== lastRoute){
    lastRoute = rk;
    appEl.classList.remove('page-enter');
    void appEl.offsetWidth;
    appEl.classList.add('page-enter');
  }
  if (boothMissing){ document.body.classList.add('app-mode'); renderNotFound(); return; }
  if (!S) return;
  const r = view();
  // Mode aplikasi penuh: pembeli/merchant/tiket = UI fungsional saja,
  // landing (nav marketing, reset, footer) disembunyikan total.
  const isApp = r === 'pembeli' || r === 'order' || r === 'merchant';
  document.body.classList.toggle('app-mode', isApp);
  const btnExit = document.getElementById('btnExit');
  if (btnExit) btnExit.hidden = (r === 'beranda');
  const gt = document.getElementById('garlandTop');
  if (gt) gt.hidden = (r !== 'beranda');
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === r));
  if (myPresenceRef) try { myPresenceRef.update({ role: r }); } catch(e){}
  VIEWS[r]();
}
function refreshMenuGate(){
  const body = $('#pembeliBody');
  if (!body) return;
  updateMenuBits(body);
}

/* ---------- beranda ---------- */
function renderLanding(){
  const live = activeOrders().find(o => o.status === 'processing') || activeOrders().slice(-1)[0] || null;
  const flow = [
    ['Scan QR', 'Standee QR di booth, buka lewat browser di perangkat digital. Tanpa install aplikasi.'],
    ['Pilih menu', 'Tandai pesanan dan masukkan nomor WhatsApp.'],
    ['Terima tiket', 'Nomor antrean dan estimasi tunggu langsung tampil.'],
    ['Bebas jelajah', 'Notifikasi WA masuk saat tinggal 2 nomor.'],
    ['Ambil pesanan', 'Tunjukkan tiket saat pesanan siap.']
  ];
  appEl.innerHTML =
  '<section class="hero">' +
    '<div class="hero-grid">' +
      '<div>' +
        '<h1>Antrean bazar pindah ke <em>Digital</em>.</h1>' +
        '<p class="lede">Scan QR di booth, pilih menu, dapat nomor antrean dan estimasi waktu. Pembeli bebas jelajah, dagangan tetap terkendali.</p>' +
        '<div class="cta-row">' +
          '<a class="btn btn-primary" href="#pembeli/' + esc(SLUG) + '">Coba sebagai Pembeli</a>' +
          '<button class="btn btn-ghost" id="btnTour" type="button">Ikuti Tur 1 Menit</button>' +
          '<a class="btn btn-ghost" href="#merchant/' + esc(SLUG) + '">Buka Dasbor Penjual</a>' +
          '<a class="btn btn-ghost" href="#daftar">Buka Booth Sendiri</a>' +
        '</div>' +
        '<p class="tiny" style="margin-top:10px">Booth aktif: <b class="mono">' + esc(SLUG) + '</b> · <b>' + esc(BOOTH().name) + '</b></p>' +
      '</div>' +
      '<div>' +
        '<div class="illus-card">' + illusHero() +
          '<p class="illus-cap">Booth UMKM, penjual, dan pembeli mengantre dengan tiket digital.</p>' +
        '</div>' +
        '<div class="stub print">' +
          '<div class="stub-glow"></div>' +
          '<div class="row"><span class="cap">Sedang dipanggil</span><span class="chip">' + esc(BOOTH().name) + '</span></div>' +
          '<div class="num" data-live-num>' + (live ? esc(live.ticket) : 'A-···') + '</div>' +
          '<div class="row sub"><span data-live-sub>' + (live ? estLabel(live) + ' &middot; ' + activeCount() + ' antrean aktif' : 'Belum ada antrean aktif') + '</span><span class="mono">BazarQ</span></div>' +
        '</div>' +
        '<p class="stub-cap">Tiket contoh booth <b class="mono">' + esc(SLUG) + '</b>. Tersinkron langsung antar perangkat.</p>' +
      '</div>' +
    '</div>' +
  '</section>' +
  '<section class="sec">' +
    '<h2>Kendala lama, jawaban sederhana</h2>' +
    '<p class="sub">Di bazar dan pasar kaget, antrean fisik membuat pembeli pergi dan UMKM kehilangan penjualan. BazarQ menggantinya dengan nomor antrean digital yang berjalan di perangkat digital standar, tanpa aplikasi, tanpa akun.</p>' +
    '<div class="vs">' +
      '<div class="card"><h3>Tanpa BazarQ</h3><ul class="tight">' +
        '<li>Antrean fisik tidak tertata di depan booth.</li>' +
        '<li>Pembeli pergi karena tidak tahu estimasi tunggu.</li>' +
        '<li>Dapur kewalahan saat lonjakan pengunjung.</li>' +
      '</ul></div>' +
      '<div class="card good"><h3>Dengan BazarQ</h3><ul class="tight">' +
        '<li>Nomor antrean dan estimasi langsung di perangkat digital pembeli.</li>' +
        '<li>Pembeli bebas menjelajah, dipanggil lewat notifikasi.</li>' +
        '<li>Tombol Dapur Penuh menjaga kualitas saat ramai.</li>' +
      '</ul></div>' +
    '</div>' +
  '</section>' +
  '<section class="sec">' +
    '<h2>Alur pembeli, dari scan sampai ambil</h2>' +
    '<p class="sub">Lima langkah inilah yang kami peragakan langsung di booth, dari awal sampai akhir.</p>' +
    '<div class="steps">' + flow.map((s,i) =>
      '<div class="step"><span class="n">0' + (i+1) + '</span><b>' + s[0] + '</b><p>' + s[1] + '</p></div>'
    ).join('') + '</div>' +
  '</section>' +
  '<section class="sec">' +
    '<h2>Pilih peran untuk mencoba</h2>' +
    '<p class="sub">Buka peran berbeda di perangkat digital berbeda, semua tersinkron otomatis di booth <b class="mono">' + esc(SLUG) + '</b>.</p>' +
    '<div class="roles">' +
      '<a class="role" href="#pembeli/' + esc(SLUG) + '"><span class="t">Pembeli</span><span class="d">Pesan tanpa aplikasi, pantau nomor antrean dan notifikasinya secara live.</span><span class="go">Buka tab pembeli &rarr;</span></a>' +
      '<a class="role" href="#merchant/' + esc(SLUG) + '"><span class="t">Penjual UMKM</span><span class="d">Panggil antrean, ubah status pesanan, tampilkan QR standee, atur Dapur Penuh.</span><span class="go">Buka dasbor penjual &rarr;</span></a>' +
      '<a class="role" href="#eo"><span class="t">Penyelenggara Acara</span><span class="d">Pantau volume antrean semua booth dan jam sibuk acara secara keseluruhan.</span><span class="go">Buka dasbor penyelenggara &rarr;</span></a>' +
      '<a class="role" href="#daftar"><span class="t">Buka Booth Sendiri</span><span class="d">Daftar 1 menit, dapat QR asli siap cetak untuk booth-mu sendiri.</span><span class="go">Daftar booth &rarr;</span></a>' +
    '</div>' +
  '</section>';
  const bt = document.getElementById('btnTour');
  if (bt) bt.addEventListener('click', () => startTour());
  maybeAutoTour();
}

/* ---------- pembeli ---------- */
function renderPembeli(){
  const mine = myOrder();
  const actives = myOrders().filter(o => o.status !== 'completed');
  if (!reorderMode && mine && mine.status !== 'completed') stage = 'ticket';
  if (!mine && stage === 'ticket') stage = 'scan';
  appEl.innerHTML =
  '<section class="view buyer-wrap">' +
    '<div class="booth-head">' +
      '<span class="booth-ic" aria-hidden="true"><img src="assets/favicon-32.png" width="46" height="46" alt="BazarQ"></span>' +
      '<div><b>' + esc(BOOTH().name) + '</b><div class="booth-sub">' + esc(BOOTH().desc || '') + ' · <span class="mono">' + esc(SLUG) + '</span></div></div>' +
      '<span class="chip ' + (S.kitchenFull ? 'off' : 'on') + '" id="boothChip">' + (S.kitchenFull ? 'Dapur penuh' : 'Buka') + '</span>' +
    '</div>' +
    '<div id="pembeliBody"></div>' +
  '</section>';
  const body = $('#pembeliBody');
  if      (stage === 'scan')   renderScan(body);
  else if (stage === 'menu')   renderMenu(body);
  else                          renderTicket(body, mine || myOrder());
}

function renderScan(body){
  body.innerHTML =
  '<div class="panel">' +
    '<div class="illus-scan">' + illusScan() + '</div>' +
    '<div class="qr-card"><div id="qrScanBox" style="display:flex;justify-content:center"></div>' +
      '<div class="qr-note">QR asli booth <b class="mono">' + esc(SLUG) + '</b>. Scan pakai kamera digital → membuka halaman ini. Untuk mencoba, tekan tombol simulasi di bawah.</div>' +
      '<p class="qr-url mono" style="word-break:break-all">' + esc(orderUrl()) + '</p>' +
    '</div>' +
    '<button class="btn btn-primary wide" id="btnScan" type="button">Coba: pindai QR booth</button>' +
  '</div>' +
  '<p class="tiny center" style="margin-top:12px">Tanpa pasang aplikasi, tanpa buat akun. Muat di bawah 100 KB agar tetap lancar saat jaringan bazar padat.</p>';
  renderRealQR($('#qrScanBox', body), orderUrl(), 168);
  $('#btnScan').addEventListener('click', () => { BazarQAudio.init(); stage = 'menu'; renderPembeli(); });
}

function renderMenu(body){
  const menu = MENU();
  if (!Object.keys(sel).length && menu.length) sel = { [menu[1] ? menu[1].id : menu[0].id]:1 };
  let total = 0;
  menu.forEach(m => { total += m.price * (sel[m.id] || 0); });
  const actives = myOrders().filter(o => o.status !== 'completed');
  body.innerHTML =
  '<div class="panel">' +
    (actives.length
      ? '<div class="warn"><b>Kamu punya ' + actives.length + ' pesanan aktif (' + actives.map(o => esc(o.ticket)).join(', ') + ').</b> Pesanan baru akan jadi tiket terpisah, tiket lama tetap tersimpan. <button class="btn btn-ghost btn-sm" id="btnBackTicket" type="button" style="margin-top:8px">Lihat tiket aktif</button></div>'
      : '') +
    '<h2 class="menu-title">Pesan dulu, nomor langsung terbit</h2>' +
    '<div id="kitchenGate">' + (S.kitchenFull
      ? '<div class="warn"><b>Dapur sedang penuh.</b> Estimasi +15 menit. Pesanan tetap diterima.</div>'
      : '') + '</div>' +
    '<div class="menu-list">' + (menu.length ? menu.map(m =>
      '<div class="menu-row' + ((sel[m.id] || 0) > 0 ? ' picked' : '') + '" data-row="' + m.id + '">' +
        '<div class="thumb">' + foodIcon(foodIconFor(m)) + '</div>' +
        '<div class="nm"><b>' + esc(m.name) + '</b><span class="ds">' + esc(m.desc || '') + '</span><span class="pr">' + rp(m.price) + '</span></div>' +
        '<div class="qty">' +
          '<button type="button" data-less="' + m.id + '" aria-label="Kurangi ' + esc(m.name) + '">−</button>' +
          '<span class="q" data-q="' + m.id + '">' + (sel[m.id] || 0) + '</span>' +
          '<button type="button" data-more="' + m.id + '" aria-label="Tambah ' + esc(m.name) + '">+</button>' +
        '</div>' +
      '</div>').join('')
      : '<div class="empty-illus">' + illusEmpty() + '<span>Semua menu sedang habis atau booth belum buka. Coba lagi beberapa menit atau tanya langsung ke penjual.</span></div>') +
    '</div>' +
    '<div class="field">' +
      '<label for="waPhone">Nomor WhatsApp</label>' +
      '<input class="input" id="waPhone" inputmode="tel" placeholder="0812 3456 7890" value="' + esc(lastPhone) + '">' +
      '<div class="field-err" id="phoneErr" hidden>Isi nomor WhatsApp yang valid, contoh 0812 3456 7890.</div>' +
    '</div>' +
    '<div class="field"><label>Metode pembayaran (verifikasi di kasir)</label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="radio" name="pay" value="qris" checked> QRIS / dompet digital (pindai QR toko)</label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-top:6px"><input type="radio" name="pay" value="cash"> Tunai di kasir</label>' +
      (BOOTH().qrisImageUrl ? '<img src="' + esc(BOOTH().qrisImageUrl) + '" alt="QRIS toko" style="max-width:220px;border-radius:12px;margin-top:10px;border:1px solid #e2e8f0">' : '<p class="tiny">QRIS toko tampil di sini setelah penjual menautkan gambar QRIS di dasbor kasir.</p>') +
    '</div>' +
    '<div class="order-bar">' +
      '<div class="total-row"><span>Total pesanan</span><span class="rp" data-total>' + rp(total) + '</span></div>' +
      '<button class="btn btn-primary wide menu-btn-gap" id="btnOrder" type="button">Kirim Pesanan &amp; Dapatkan Tiket</button>' +
    '</div>' +
    '<p class="tiny center" style="margin-top:10px">Status awal: <b>Menunggu Pembayaran</b>. Penjual menekan Konfirmasi Lunas → pesanan diteruskan ke dapur.</p>' +
  '</div>';
  body.addEventListener('click', e => {
    const more = e.target.closest('[data-more]');
    const less = e.target.closest('[data-less]');
    if (more){ sel[more.dataset.more] = (sel[more.dataset.more] || 0) + 1; updateMenuBits(body); }
    if (less){ const id = less.dataset.less; sel[id] = Math.max(0, (sel[id] || 0) - 1); updateMenuBits(body); }
  });
  $('#btnOrder').addEventListener('click', submitOrder);
  const backT = $('#btnBackTicket');
  if (backT) backT.addEventListener('click', () => { reorderMode = false; stage = 'ticket'; renderAll(); });
  const waInput = $('#waPhone');
  if (waInput) waInput.addEventListener('input', () => {
    $('#phoneErr').hidden = true;
    waInput.classList.remove('err');
  });
}

function updateMenuBits(body){
  const menu = MENU();
  let total = 0, count = 0;
  menu.forEach(m => {
    const q = sel[m.id] || 0;
    total += m.price * q; count += q;
    const qEl = $('[data-q="' + m.id + '"]', body);
    if (qEl) qEl.textContent = q;
    const row = $('[data-row="' + m.id + '"]', body);
    if (row) row.classList.toggle('picked', q > 0);
  });
  const t = $('[data-total]', body);
  if (t) t.textContent = rp(total);
  const b = $('#btnOrder', body);
  if (b){
    b.disabled = count === 0;
    b.textContent = 'Kirim Pesanan & Dapatkan Tiket';
  }
  const g = $('#kitchenGate', body);
  if (g) g.innerHTML = S.kitchenFull
    ? '<div class="warn"><b>Dapur sedang penuh.</b> Estimasi +15 menit. Pesanan tetap diterima.</div>'
    : '';
  const chip = $('#boothChip');
  if (chip){ chip.textContent = S.kitchenFull ? 'Dapur penuh' : 'Buka'; chip.className = 'chip ' + (S.kitchenFull ? 'off' : 'on'); }
}

function submitOrder(){
  const input = $('#waPhone');
  const errBox = $('#phoneErr');
  errBox.hidden = true; input.classList.remove('err');
  const digits = input.value.replace(/\D/g,'');
  const ok = /^(08\d{8,11}|628\d{8,11})$/.test(digits);
  if (!ok){ errBox.hidden = false; input.classList.add('err'); input.focus(); return; }
  lastPhone = input.value;
  const norm = digits.indexOf('628') === 0 ? '0' + digits.slice(2) : digits;
  const pm = document.querySelector('input[name="pay"]:checked');
  const payMethod = pm ? pm.value : 'cash';
  const o = createOrder(norm, payMethod);
  if (!o){ toast('Belum ada menu terpilih. Pilih minimal 1 menu.'); return; }
  stage = 'ticket'; sel = {};
  renderAll();
  toast('Tiket ' + o.ticket + ' terbit (' + (payMethod === 'qris' ? 'QRIS' : 'Tunai') + '). Tunjukkan ke kasir untuk verifikasi.');
}

function renderTicket(body, o){
  if (!o) return;
  const done = o.status === 'completed';
  // waiting (belum lunas)=1, processing=2, ready=3, completed=4
  const st = o.status === 'waiting' ? 1 : o.status === 'processing' ? 2 : 3;
  const payBadge = o.paid ? 'Lunas ✓' : 'Menunggu Pembayaran';
  const payCls = o.paid ? 'on' : 'off';
  const waMsgs = S.log.filter(l => l.type === 'wa' && l.phone === o.phone).slice(0, 10);
  const soundLabel = () => 'Suara panggilan: ' + (BazarQAudio.enabled ? 'ON' : 'OFF');
  // Banner aksi berikutnya: pembeli selalu tahu harus apa setelah ini
  const nextAction =
    done ? ''
    : o.status === 'waiting'
      ? '<div class="warn big"><b>Langkah selanjutnya: bayar ke kasir.</b> Sebutkan tiket <b class="mono">' + esc(o.ticket) + '</b> (' + rp(o.total) + ', ' + (o.payMethod === 'qris' ? 'QRIS' : 'tunai') + '). Biarkan halaman ini terbuka untuk pantau status.</div>'
    : o.status === 'processing'
      ? '<div class="warn" style="margin-bottom:12px"><b>Dapur sedang memasak pesananmu.</b> Tunggu notifikasi atau pantau estimasi ' + estLabel(o) + ' di atas.</div>'
      : '<div class="warn-ready warn" style="margin-bottom:12px"><b>Pesanan siap! Segera ke booth</b> dan tunjukkan tiket <b class="mono">' + esc(o.ticket) + '</b>.</div>';
  const tUrl = ticketUrl(SLUG, o.id);
  const others = myOrders().filter(x => x.id !== o.id && x.status !== 'completed');
  body.innerHTML =
  (others.length
    ? '<div class="panel" style="margin-bottom:12px"><b class="tiny">Pesanan lainmu: ' + others.map(x => esc(x.ticket) + ' (' + estLabel(x) + ')').join(' · ') + '</b></div>'
    : '') +
  nextAction +
  '<div class="stub big print">' +
    '<div class="stub-glow"></div>' +
    '<div class="row"><span class="cap">Nomor antrean Anda</span><span class="chip">' + esc(BOOTH().name) + '</span></div>' +
    '<div class="num">' + esc(o.ticket) + '</div>' +
    '<div class="row sub"><span>' + estLabel(o) + '</span><span class="mono">' + rp(o.total) + '</span></div>' +
    '<div class="row sub"><span class="chip ' + payCls + '">' + payBadge + ' · ' + (o.payMethod === 'qris' ? 'QRIS' : 'Tunai') + '</span></div>' +
    '<div class="tear"></div>' +
    (done
      ? '<div class="pos">Pesanan selesai. Terima kasih sudah mampir!</div>'
      : '<div class="pos">Antrean ke ' + posOf(o) + ' dari ' + activeCount() + ' antrean aktif</div>') +
  '</div>' +
  '<div class="panel" style="margin-top:16px">' +
    '<div class="timeline">' +
      ['Menunggu Pembayaran','Diproses Dapur','Siap Diambil'].map((t,i) =>
        '<div class="tl ' + (st > i+1 ? 'done' : st === i+1 ? 'now' : '') + '"><span class="bar"></span>' + t + '</div>').join('') +
    '</div>' +
    '<div class="items-box">' +
      o.items.map(i => '<div class="item-line"><span>' + i.qty + '× ' + esc(i.name) + '</span><span class="mono">' + rp(i.price * i.qty) + '</span></div>').join('') +
      '<div class="item-line sum"><span>Total (bayar di booth)</span><span class="mono">' + rp(o.total) + '</span></div>' +
    '</div>' +
    (done ? '' : '<div class="wait-line">Menunggu <b class="mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</b></div>') +
    '<div class="wa">' +
      '<div class="wa-cap">Simulasi notifikasi WhatsApp ke ' + maskPhone(o.phone) + '.</div>' +
      (waMsgs.length
        ? waMsgs.map(m => '<div class="bubble">' + esc(m.text) + '<span class="t">' + hhmm(m.at) + ' &middot; BazarQ</span></div>').join('')
        : '<div class="empty">Belum ada notifikasi. Muncul saat antrean tinggal 2 nomor dan saat pesanan siap.</div>') +
    '</div>' +
    '<div class="btn-row">' +
      '<button class="sound-btn ' + (BazarQAudio.enabled ? 'on' : '') + '" id="btnBuyerSound" type="button">' + soundLabel() + '</button>' +
      '<button class="btn btn-ghost btn-sm" id="btnCopyTicket" type="button">Simpan tautan tiket</button>' +
      (done
        ? '<button class="btn btn-primary" id="btnAgain" type="button">Pesan lagi</button>' +
          '<a class="btn btn-ghost" href="#beranda">Beranda</a>'
        : '<button class="btn btn-primary btn-sm" id="btnReorder" type="button">+ Pesan menu lagi</button>' +
          '<a class="btn btn-ghost btn-sm" href="#beranda">Beranda</a>') +
    '</div>' +
  '</div>';

  const cp = $('#btnCopyTicket');
  if (cp) cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tUrl);
      toast('Tautan tiket disalin. Buka lagi kapan pun bila tab tertutup.');
    } catch(e){
      prompt('Salin tautan tiket ini:', tUrl);
    }
  });

  const sbtn = $('#btnBuyerSound');
  if (sbtn) sbtn.addEventListener('click', () => {
    BazarQAudio.init();
    BazarQAudio.toggle();
    sbtn.className = 'sound-btn' + (BazarQAudio.enabled ? ' on' : '');
    sbtn.textContent = soundLabel();
  });
  if (done){
    $('#btnAgain').addEventListener('click', () => {
      stage = 'menu'; sel = {}; reorderMode = false;
      renderAll();
    });
  } else {
    const ro = $('#btnReorder');
    if (ro) ro.addEventListener('click', () => {
      sel = {}; reorderMode = true; stage = 'menu';
      renderAll();
      toast('Tiket ' + o.ticket + ' tetap tersimpan. Pesanan baru jadi tiket terpisah.');
    });
  }
}

/* ---------- daftar booth (untuk orang lain) ---------- */
function renderDaftar(){
  appEl.innerHTML =
  '<section class="view buyer-wrap"><div class="panel">' +
    '<h2 class="menu-title">Buka booth-mu sendiri</h2>' +
    '<p class="tiny" style="margin:0 0 16px">Gratis untuk mencoba. Isi nama booth + PIN, sistem buatkan halaman sendiri + <b>QR asli siap cetak</b> yang langsung membuka halaman order booth-mu.</p>' +
    '<div id="daftarForm">' +
      '<div class="field"><label for="fName">Nama booth</label>' +
      '<input class="input" id="fName" placeholder="contoh: Kopi Rame" maxlength="40"></div>' +
      '<div class="field"><label for="fDesc">Deskripsi singkat</label>' +
      '<input class="input" id="fDesc" placeholder="contoh: Booth kopi · bazar akhir pekan" maxlength="80"></div>' +
      '<div class="field"><label for="fPin">PIN penjual (4-6 digit)</label>' +
      '<input class="input pin" id="fPin" inputmode="numeric" maxlength="6" placeholder="1234" value="1234"></div>' +
      '<div class="field-err" id="daftarErr" hidden></div>' +
      '<button class="btn btn-primary wide" id="btnDaftar" type="button">Buat Booth &amp; Tampilkan QR</button>' +
    '</div>' +
    '<div id="daftarResult" style="margin-top:18px"></div>' +
  '</div></section>';
  $('#btnDaftar').addEventListener('click', async () => {
    const err = $('#daftarErr');
    const name = $('#fName').value.trim();
    const desc = $('#fDesc').value.trim();
    const pin = $('#fPin').value.trim();
    if (name.length < 3){ err.hidden = false; err.textContent = 'Nama booth minimal 3 huruf.'; return; }
    if (!/^\d{4,6}$/.test(pin)){ err.hidden = false; err.textContent = 'PIN harus 4-6 digit angka.'; return; }
    err.hidden = true;
    const btn = $('#btnDaftar'); btn.disabled = true; btn.textContent = 'Membuat booth…';
    try {
      const slug = await createBooth(name, pin, desc);
      const ourl = orderUrl(slug), murl = merchantUrl(slug);
      $('#daftarResult').innerHTML =
        '<div class="qr-card"><div id="qrNewBox" style="display:flex;justify-content:center"></div>' +
        '<p class="tiny center">Scan QR ini → langsung membuka order booth <b>' + esc(name) + '</b></p>' +
        '<p class="qr-url mono" style="word-break:break-all">' + esc(ourl) + '</p></div>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<a class="btn btn-primary" href="#merchant/' + esc(slug) + '">Buka Dasbor Penjual</a>' +
          '<a class="btn btn-ghost" href="#pembeli/' + esc(slug) + '">Coba sebagai Pembeli</a>' +
        '</div>' +
        '<p class="tiny" style="margin-top:10px">PIN penjual: <b class="mono">' + esc(pin) + '</b> · kode booth: <b class="mono">' + esc(slug) + '</b><br>' +
        'Cetak QR: simpan gambar QR di atas, atau buka dasbor penjual → <b>QR Standee</b> → layar penuh. Tautan penjual (<span class="mono">' + esc(murl) + '</span>) hanya untuk penjual, jangan disebar ke pembeli.</p>';
      renderRealQR($('#qrNewBox'), ourl, 200);
      toast('Booth ' + slug + ' siap! QR sudah bisa dipindai.');
    } catch(e){
      console.error(e);
      err.hidden = false; err.textContent = 'Gagal membuat booth. Periksa koneksi, lalu coba lagi.';
      btn.disabled = false; btn.textContent = 'Buat Booth & Tampilkan QR';
    }
  });
}

/* ---------- merchant: View B Kasir + View C Dapur + Display (sesuai PRD + skill rules) ----------
   Fondasi lama dipertahankan: #merchant/{slug} = dashboard gabungan.
   Sub-route baru (tanpa framework, palette & class lama dipakai ulang):
   /kasir = 1 layar 1 keputusan (lunas/belum) · /dapur = fokus masak · /display = read-only TV. */
let merchantTab = 'kasir';
function renderMerchant(){
  const sub = merchantSub();
  if (sub === 'dapur'){ merchantTab = 'dapur'; return renderMerchantDapur(); }
  if (sub === 'display'){ return renderMerchantDisplay(); }
  if (sub === 'kasir'){ merchantTab = 'kasir'; return renderMerchantKasir(); }
  return renderMerchantAll();
}
function renderMerchantAll(){
  if (sessionStorage.getItem(K_AUTH()) !== '1'){ renderPinLogin(); return; }
  const waitUnpaid = S.orders.filter(o => o.status === 'waiting' && !o.paid);
  const proc  = S.orders.filter(o => o.status === 'processing');
  const ready = S.orders.filter(o => o.status === 'ready');
  const done  = completed();
  const avg   = avgMins();
  const menuAll = MENU_ALL();

  const ocCashier = o =>
    '<div class="ocard">' +
      '<div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</span></div>' +
      '<div class="items">' + o.items.map(i => i.qty + '× ' + esc(i.name)).join(' &middot; ') +
        '<span class="mono tot">' + rp(o.total) + '</span></div>' +
      '<div class="tiny" style="margin:2px 0 10px">Bayar via ' + (o.payMethod === 'qris' ? 'QRIS' : 'Tunai') + ' · WA ' + esc(maskPhone(o.phone)) + ' · masuk ' + hhmm(o.createdAt) + '</div>' +
      '<div class="act">' +
        '<button class="btn btn-primary btn-sm" data-paid="' + o.id + '" type="button">Konfirmasi Lunas</button>' +
        '<span class="st waiting">Belum Bayar</span>' +
      '</div>' +
    '</div>';
  const ocKitchen = o =>
    '<div class="ocard">' +
      '<div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</span></div>' +
      '<div class="items">' + o.items.map(i => i.qty + '× ' + esc(i.name)).join(' &middot; ') +
        '<span class="mono tot">' + rp(o.total) + '</span></div>' +
      '<div class="act">' +
        (o.status === 'processing' ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':ready" type="button">Pesanan Siap / Panggil</button>' : '') +
        (o.status === 'ready'      ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':completed" type="button">Diserahkan / Selesai</button>' : '') +
      '</div>' +
    '</div>';

  appEl.innerHTML =
  '<section class="view">' +
    '<div class="m-head">' +
      '<div>' +
        '<h2>Dasbor ' + esc(BOOTH().name) + '</h2>' +
        '<p class="sub2">Booth <b class="mono">' + esc(SLUG) + '</b> · Kasir + Dapur dalam satu dasbor.</p>' +
      '</div>' +
      '<div class="m-actions">' +
        '<button class="btn btn-ghost btn-sm" id="btnQRFull" type="button">QR Standee</button>' +
        bellBtn() +
        '<button class="sound-btn ' + (BazarQAudio.enabled ? 'on' : '') + '" id="btnMSound" type="button">Suara: ' + (BazarQAudio.enabled ? 'ON' : 'OFF') + '</button>' +
        '<button class="switch ' + (S.kitchenFull ? 'on' : '') + '" id="btnKitchen" type="button" aria-pressed="' + S.kitchenFull + '">' +
          '<span class="track" aria-hidden="true"></span><span>Dapur Penuh (+15 mnt)</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    (S.kitchenFull
      ? '<div class="warn big"><b>Dapur Penuh aktif.</b> Estimasi tiket baru +15 menit.</div>'
      : '') +
    '<div class="btn-row" style="margin:12px 0">' +
      '<button class="btn btn-sm ' + (merchantTab === 'kasir' ? 'btn-primary' : 'btn-ghost') + '" id="tabKasir" type="button">Kasir (' + waitUnpaid.length + ' menunggu)</button>' +
      '<button class="btn btn-sm ' + (merchantTab === 'dapur' ? 'btn-primary' : 'btn-ghost') + '" id="tabDapur" type="button">Dapur (' + (proc.length + ready.length) + ' aktif)</button>' +
    '</div>' +
    '<div class="stat-chips">' +
      '<div class="stat"><span class="v">' + S.orders.length  + '</span><span class="l">masuk hari ini</span></div>' +
      '<div class="stat"><span class="v">' + activeCount()    + '</span><span class="l">antrean aktif</span></div>' +
      '<div class="stat"><span class="v">' + done.length      + '</span><span class="l">selesai</span></div>' +
      '<div class="stat"><span class="v">' + rp(revenue())    + '</span><span class="l">omzet (bayar di booth)</span></div>' +
      '<div class="stat"><span class="v">' + (avg == null ? '···' : avg + ' mnt') + '</span><span class="l">rata-rata/pesanan</span></div>' +
    '</div>' +
    (merchantTab === 'kasir'
    ? '<div class="board"><div class="col"><h3>Menunggu Pembayaran <span class="count">' + waitUnpaid.length + '</span></h3>' +
        (waitUnpaid.length ? waitUnpaid.map(ocCashier).join('') : '<div class="empty-illus">' + illusEmpty() + '<span>Tidak ada antrean menunggu. Tunjukkan QR standee.</span></div>') + '</div>' +
      '<div class="col"><h3>Pembeli Langsung <span class="count">langsung</span></h3><div class="panel">' +
        '<p class="tiny">Untuk pembeli yang datang langsung tanpa perangkat digital. Pesanan otomatis dianggap <b>lunas tunai</b> dan diteruskan ke dapur.</p>' +
        '<p class="tiny">Contoh: pembeli minta 2 Ayam Geprek + 1 Es Teh → isi angka 2 dan 1 pada menu di bawah, lalu klik Catat (Lunas).</p>' +
        '<div class="field"><label>Pilih menu & jumlah</label><div style="display:flex;flex-direction:column;gap:8px">' +
          menuAll.filter(m => m.active !== false).map(m =>
            '<label style="display:flex;gap:8px;align-items:center"><span class="thumb sm">' + foodIcon(foodIconFor(m)) + '</span><span style="flex:1;min-width:0">' + esc(m.name) + ' <span class="mono tiny">' + rp(m.price) + '</span></span><input class="input mono" data-wiqty="' + m.id + '" type="number" inputmode="numeric" min="0" max="10" value="0" style="width:72px;text-align:center"></label>'
          ).join('') + '</div></div>' +
        '<div class="field"><label for="wiPhone">Nomor WA (opsional, untuk notifikasi)</label><input class="input" id="wiPhone" inputmode="tel" placeholder="contoh: 0812 3456 7890"></div>' +
        '<button class="btn btn-primary btn-sm" id="btnWalkin" type="button">+ Catat (Lunas)</button></div>' +
      '<h3 class="mt">Menu Habis</h3><div class="panel">' +
        menuAll.map(m => '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-menu="' + m.id + '"' + (m.active !== false ? ' checked' : '') + '><span class="thumb sm">' + foodIcon(foodIconFor(m)) + '</span> ' + esc(m.name) + ' <span class="mono tiny">' + rp(m.price) + '</span></label>').join('') + '</div>' +
      '<h3 class="mt">QRIS Toko</h3><div class="panel">' +
        '<div class="field"><label>Tautan gambar QRIS</label><input class="input mono" id="qrisUrl" value="' + esc(BOOTH().qrisImageUrl || '') + '" placeholder="https://.../qris.png"></div>' +
        '<button class="btn btn-ghost btn-sm" id="btnQris" type="button">Simpan QRIS</button></div>' +
      '</div></div>'
    : '<div class="board">' +
      '<div class="col"><h3>Diproses <span class="count">' + proc.length + '</span></h3>' +
        (proc.length ? proc.map(ocKitchen).join('') : '<div class="empty-illus">' + illusEmpty() + '<span>Belum ada yang diproses. Penjual menekan Konfirmasi Lunas dulu.</span></div>') + '</div>' +
      '<div class="col"><h3>Siap Diambil <span class="count">' + ready.length + '</span></h3>' +
        (ready.length ? ready.map(ocKitchen).join('') : '<div class="empty-illus">' + illusEmpty() + '<span>Belum ada pesanan siap.</span></div>') + '</div>' +
      '<div class="col">' +
        '<h3>Aktivitas <span class="count">' + S.log.length + '</span></h3>' +
        '<div class="panel feed">' + (S.log.slice(0,7).map(l =>
          '<div class="feed-line"><span class="mono">' + hhmm(l.at) + '</span><span>' + esc(l.text) + '</span></div>').join('') || '<div class="empty">Belum ada aktivitas.</div>') + '</div>' +
        '<h3 class="mt">Selesai hari ini <span class="count">' + done.length + '</span></h3>' +
        '<div class="panel feed">' + (done.slice(0,6).map(o =>
          '<div class="feed-line"><span class="mono">' + esc(o.ticket) + '</span><span>' + rp(o.total) + ' &middot; ' + hhmm(o.completedAt) + '</span></div>').join('') || '<div class="empty">Belum ada yang selesai.</div>') + '</div>' +
      '</div>' +
    '</div>') +
  '</section>';

  $('#tabKasir').addEventListener('click', () => { merchantTab = 'kasir'; renderAll(); });
  $('#tabDapur').addEventListener('click', () => { merchantTab = 'dapur'; renderAll(); });
  $('#btnKitchen').addEventListener('click', () => {
    toggleKitchen(); renderAll();
    toast(S.kitchenFull ? 'Dapur Penuh aktif: estimasi +15 mnt.' : 'Dapur Penuh dimatikan.');
  });
  $('#btnQRFull').addEventListener('click', showQRFullscreen);
  bindBell();
  $('#btnMSound').addEventListener('click', () => {
    BazarQAudio.toggle();
    const btn = $('#btnMSound');
    btn.className = 'sound-btn' + (BazarQAudio.enabled ? ' on' : '');
    btn.textContent = 'Suara: ' + (BazarQAudio.enabled ? 'ON' : 'OFF');
  });
  $$('[data-paid]').forEach(b => b.addEventListener('click', () => {
    confirmPaid(Number(b.dataset.paid));
    merchantTab = 'kasir'; renderAll();
    toast('Lunas dikonfirmasi → diteruskan ke dapur. Pantau di bagian Dapur.');
  }));
  $$('[data-set]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.set.split(':');
    setStatus(Number(p[0]), p[1]);
    renderAll();
  }));
  $$('[data-menu]').forEach(c => c.addEventListener('change', () => {
    const m = S.menu.find(x => x.id === c.dataset.menu);
    if (m){ m.active = c.checked; save(); toast(m.name + (c.checked ? ' tersedia.' : ' ditandai habis.')); }
  }));
  const bq = $('#btnQris');
  if (bq) bq.addEventListener('click', () => {
    const v = $('#qrisUrl').value.trim().slice(0, 500);
    if (v && !/^https:\/\//i.test(v)){ toast('Tautan QRIS harus diawali https://'); return; }
    S.profile.qrisImageUrl = v; save(); renderAll();
    toast('QRIS toko disimpan, tampil di halaman bayar pembeli.');
  });
  const bw = $('#btnWalkin');
  if (bw) bw.addEventListener('click', () => {
    const phoneRaw = $('#wiPhone').value.trim();
    const phone = phoneRaw || 'walk-in';
    if (phoneRaw && !/^(08\d{8,11}|628\d{8,11})$/.test(phoneRaw.replace(/\D/g,''))){ toast('Nomor WA tidak valid, kosongkan atau isi contoh: 0812 3456 7890.'); return; }
    const menu = MENU_ALL().filter(m => m.active !== false);
    const items = $$('[data-wiqty]').map(inp => {
      const m = menu.find(x => x.id === inp.dataset.wiqty);
      const qty = Math.max(0, Math.min(10, Math.floor(Number(inp.value) || 0)));
      if (!m || qty <= 0) return null;
      return { id:m.id, qty, name:m.name, price:m.price };
    }).filter(Boolean);
    if (!items.length){ toast('Pilih minimal 1 menu dengan jumlah > 0.'); return; }
    const totalQty = items.reduce((a,i) => a + i.qty, 0);
    if (totalQty > 20){ toast('Maksimal 20 potong per pesanan langsung.'); return; }
    S.seq += 1;
    S.orders.push({ id:S.seq, ticket:tk(S.seq), phone, items, total:items.reduce((a,i) => a + i.price * i.qty, 0), status:'processing', paid:true, payMethod:'cash', createdAt:Date.now(), processingAt:Date.now(), wa2:true, waReady:true });
    pushLog(S, 'proc', tk(S.seq) + ' pesanan langsung dicatat kasir (lunas tunai), diteruskan ke dapur.');
    save(); renderAll(); toast(tk(S.seq) + ' (langsung) masuk dapur.');
  });
}

/* ----- bel pesan merchant: ringkasan realtime yang bisa diklik -----
   Badge = antrean menunggu pembayaran (butuh aksi kasir). Klik = lompat ke kasir + baca ringkasan. */
function bellBtn(){
  const n = S.orders.filter(o => o.status === 'waiting' && !o.paid).length;
  return '<button class="sound-btn" id="btnBell" type="button">🔔 Pesan' + (n ? ' <span class="chip off" style="margin-left:2px">' + n + '</span>' : '') + '</button>';
}
function bindBell(){
  const b = $('#btnBell'); if (!b) return;
  b.addEventListener('click', () => {
    BazarQAudio.unlock();
    const w = S.orders.filter(o => o.status === 'waiting' && !o.paid).slice(-5).reverse();
    if (!w.length){ toast('Tidak ada pesan baru. Semua antrean sudah ditangani.'); return; }
    merchantTab = 'kasir';
    if (merchantSub() && merchantSub() !== 'kasir'){ location.hash = '#merchant/' + SLUG + '/kasir'; }
    else { renderAll(); }
    toast(w.length + ' menunggu: ' + w.map(o => o.ticket + ' (' + (o.payMethod === 'qris' ? 'QRIS' : 'tunai') + ')').join(', '));
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e){ window.scrollTo(0, 0); }
  });
}
/* ----- split-view: kasir / dapur / display (pakai ulang class+token lama) ----- */
function mSubNav(active){
  return '<div class="btn-row m-subnav" style="margin:12px 0">' +
    '<a class="btn btn-sm ' + (active === 'kasir' ? 'btn-primary' : 'btn-ghost') + '" href="#merchant/' + esc(SLUG) + '/kasir">Kasir</a>' +
    '<a class="btn btn-sm ' + (active === 'dapur' ? 'btn-primary' : 'btn-ghost') + '" href="#merchant/' + esc(SLUG) + '/dapur">Dapur</a>' +
    '<a class="btn btn-sm ' + (active === 'display' ? 'btn-primary' : 'btn-ghost') + '" href="#merchant/' + esc(SLUG) + '/display">Layar</a>' +
    '<a class="btn btn-sm btn-ghost" href="#merchant/' + esc(SLUG) + '">Semua</a>' +
  '</div>';
}
function mHeadRow(subLabel){
  return '<div class="m-head"><div><h2>' + esc(BOOTH().name) + '</h2>' +
    '<p class="sub2">Booth <b class="mono">' + esc(SLUG) + '</b> · ' + subLabel + ' · 1 layar = 1 keputusan.</p></div>' +
    '<div class="m-actions">' +
      '<button class="btn btn-ghost btn-sm" id="btnQRFull" type="button">QR Standee</button>' +
      bellBtn() +
      '<button class="sound-btn ' + (BazarQAudio.enabled ? 'on' : '') + '" id="btnMSound" type="button">Suara: ' + (BazarQAudio.enabled ? 'ON' : 'OFF') + '</button>' +
      '<button class="switch ' + (S.kitchenFull ? 'on' : '') + '" id="btnKitchen" type="button" aria-pressed="' + S.kitchenFull + '">' +
        '<span class="track" aria-hidden="true"></span><span>Dapur Penuh (+15 mnt)</span></button>' +
    '</div></div>' +
    (S.kitchenFull ? '<div class="warn big"><b>Dapur Penuh aktif.</b> Estimasi tiket baru +15 menit.</div>' : '');
}
function bindMHead(){
  const k = $('#btnKitchen'); if (k) k.addEventListener('click', () => { toggleKitchen(); renderAll(); });
  const q = $('#btnQRFull'); if (q) q.addEventListener('click', showQRFullscreen);
  const s = $('#btnMSound'); if (s) s.addEventListener('click', () => { BazarQAudio.toggle(); renderAll(); });
  bindBell();
}
function renderMerchantKasir(){
  if (sessionStorage.getItem(K_AUTH()) !== '1'){ renderPinLogin(); return; }
  const waitUnpaid = S.orders.filter(o => o.status === 'waiting' && !o.paid);
  appEl.innerHTML = '<section class="view buyer-wrap mode-kasir">' + mHeadRow('Kasir') + mSubNav('kasir') +
    '<div class="col"><h3>Menunggu Pembayaran <span class="count">' + waitUnpaid.length + '</span></h3>' +
    (waitUnpaid.length ? waitUnpaid.map(o =>
      '<div class="ocard"><div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</span></div>' +
      '<div class="items">' + o.items.map(i => i.qty + '× ' + esc(i.name)).join(' &middot; ') + '<span class="mono tot">' + rp(o.total) + '</span></div>' +
      '<div class="tiny">Bayar via ' + (o.payMethod === 'qris' ? 'QRIS' : 'Tunai') + ' · WA ' + esc(maskPhone(o.phone)) + ' · ' + hhmm(o.createdAt) + '</div>' +
      '<div class="act"><button class="btn btn-primary wide" data-paid="' + o.id + '" type="button">✅ Konfirmasi Lunas</button></div></div>'
    ).join('') : '<div class="empty-illus">' + illusEmpty() + '<span>Tidak ada antrean menunggu.</span></div>') +
    '</div><div class="btn-row"><a class="btn btn-ghost btn-sm" href="#merchant/' + esc(SLUG) + '">Pesanan langsung · Menu habis · QRIS → tampilan gabungan</a></div></section>';
  bindMHead();
  $$('[data-paid]').forEach(b => b.addEventListener('click', () => { confirmPaid(Number(b.dataset.paid)); renderAll(); toast('Lunas → diteruskan ke dapur.'); }));
}
function renderMerchantDapur(){
  if (sessionStorage.getItem(K_AUTH()) !== '1'){ renderPinLogin(); return; }
  const proc = S.orders.filter(o => o.status === 'processing');
  const ready = S.orders.filter(o => o.status === 'ready');
  const card = (o, btn) => '<div class="ocard"><div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</span></div>' +
    '<div class="items">' + o.items.map(i => i.qty + '× ' + esc(i.name)).join(' &middot; ') + '</div><div class="act">' + btn + '</div></div>';
  appEl.innerHTML = '<section class="view mode-dapur">' + mHeadRow('Dapur') + mSubNav('dapur') +
    '<div class="board"><div class="col"><h3>Diproses <span class="count">' + proc.length + '</span></h3>' +
    (proc.length ? proc.map(o => card(o, '<button class="btn btn-primary wide" data-set="' + o.id + ':ready" type="button">🔔 Pesanan Siap / Panggil</button>')).join('') : '<div class="empty">Belum ada yang diproses.</div>') + '</div>' +
    '<div class="col"><h3>Siap Diambil <span class="count">' + ready.length + '</span></h3>' +
    (ready.length ? ready.map(o => card(o, '<button class="btn btn-primary wide" data-set="' + o.id + ':completed" type="button">✅ Diserahkan / Selesai</button>')).join('') : '<div class="empty">Belum ada pesanan siap.</div>') + '</div></div></section>';
  bindMHead();
  $$('[data-set]').forEach(b => b.addEventListener('click', () => { const p = b.dataset.set.split(':'); setStatus(Number(p[0]), p[1]); renderAll(); }));
}
function renderMerchantDisplay(){
  // Layar publik: tanpa PIN, tanpa tombol aksi, read-only + auto-refresh via liveTick.
  const now = activeOrders().slice(-6).reverse();
  const ready = S.orders.filter(o => o.status === 'ready').slice(-4).reverse();
  appEl.innerHTML = '<section class="view mode-display"><div class="m-head"><div><h2>' + esc(BOOTH().name) + ' · Sedang disiapkan</h2>' +
    '<p class="sub2">Layar publik booth <b class="mono">' + esc(SLUG) + '</b> · Pasang di TV/proyektor · tanpa tombol aksi.</p></div>' +
    '<span class="chip ' + (S.kitchenFull ? 'off' : 'on') + '">' + (S.kitchenFull ? 'Dapur penuh' : 'Buka') + '</span></div>' +
    '<div class="board"><div class="col"><h3>Diproses</h3>' +
    (now.length ? now.map(o => '<div class="ocard"><div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="st processing">' + esc(o.status) + '</span></div></div>').join('') : '<div class="empty">Belum ada antrean.</div>') + '</div>' +
    '<div class="col"><h3>Siap diambil</h3>' +
    (ready.length ? ready.map(o => '<div class="ocard ready"><div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="st ready">siap</span></div><div class="tiny">Tunjukkan tiket di booth</div></div>').join('') : '<div class="empty">Belum ada yang siap.</div>') + '</div></div>' +
    '<p class="tiny center" style="margin-top:12px">Pesan via <span class="mono">' + esc(orderUrl()) + '</span></p></section>';
}

function renderPinLogin(){
  appEl.innerHTML =
  '<section class="view buyer-wrap">' +
    '<div class="panel">' +
      '<h2 class="menu-title">Masuk dasbor ' + esc(BOOTH().name) + '</h2>' +
      '<p class="tiny" style="margin:0 0 16px">Booth <b class="mono">' + esc(SLUG) + '</b> · login pakai PIN booth, tanpa email, tanpa kata sandi panjang.</p>' +
      '<div class="field" style="margin-top:0">' +
        '<label for="pin">PIN booth</label>' +
        '<input class="input pin" id="pin" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off">' +
        '<div class="field-err" id="pinErr" hidden>PIN salah. Coba lagi.</div>' +
      '</div>' +
      '<button class="btn btn-primary wide" id="btnPin" type="button">Masuk</button>' +
      (SLUG === DEFAULT_SLUG ? '<p class="tiny center" style="margin-top:10px">PIN contoh: <b>1234</b></p>' : '') +
    '</div>' +
  '</section>';

  const go = async () => {
    BazarQAudio.unlock();
    const val = $('#pin').value.trim();
    let ok = false;
    if (/^\d{4,6}$/.test(val)){
      const h = await sha256hex(val);
      ok = (h === STORED_PIN_HASH());
      // Fallback migrasi: booth lama yang masih simpan plaintext
      if (!ok && S.profile && S.profile.pin && val === String(S.profile.pin)){
        ok = true;
        S.profile.pinHash = h; delete S.profile.pin; save();
      }
    }
    if (ok){ try { sessionStorage.setItem(K_AUTH(),'1'); } catch(e){} renderAll(); }
    else { $('#pinErr').hidden = false; $('#pin').value = ''; $('#pin').focus(); }
  };
  $('#btnPin').addEventListener('click', go);
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  $('#pin').focus();
}

/* ---------- dasbor EO ---------- */
function renderEO(){
  const contoh = [
    { name:'Sate Klathak Mas Yog', n:41 },
    { name:'Kopi Tiam Rame',       n:38 },
    { name:'Cireng Bu Yuli',       n:27 }
  ];
  const tenants = [{ name:BOOTH().name + ' (booth ' + SLUG + ', langsung)', n:S.orders.length }].concat(contoh);
  const maxT = Math.max.apply(null, tenants.map(t => t.n).concat([1]));
  const hourBase = { 9:4, 10:9, 11:16, 12:28, 13:21, 14:8, 15:3 };
  S.orders.forEach(o => { const h = new Date(o.createdAt).getHours(); if (hourBase[h] != null) hourBase[h] += 1; });
  const hours   = Object.keys(hourBase).map(h => [Number(h), hourBase[h]]);
  const maxH    = Math.max.apply(null, hours.map(x => x[1]).concat([1]));
  const busiest = hours.reduce((a,b) => b[1] > a[1] ? b : a);
  const kitchenEvents = S.log.filter(l => l.type === 'kitchen' && l.text.indexOf('dinyalakan') >= 0).length;
  const total = tenants.reduce((a,t) => a + t.n, 0);

  appEl.innerHTML =
  '<section class="view">' +
    '<div class="m-head"><div>' +
      '<h2>Dasbor Penyelenggara</h2>' +
      '<p class="sub2">Ringkasan antrean semua booth. Data langsung dari booth <b class="mono">' + esc(SLUG) + '</b>, sisanya contoh.</p>' +
    '</div></div>' +
    '<div class="stat-chips">' +
      '<div class="stat"><span class="v">' + total + '</span><span class="l">total antrean event</span></div>' +
      '<div class="stat"><span class="v">' + activeCount() + '</span><span class="l">antrean berjalan</span></div>' +
      '<div class="stat"><span class="v">' + pad2(busiest[0]) + ':00</span><span class="l">jam tersibuk</span></div>' +
      '<div class="stat"><span class="v">' + kitchenEvents + '×</span><span class="l">dapur penuh aktif</span></div>' +
    '</div>' +
    '<div class="grid2">' +
      '<div class="panel"><h3>Volume antrean per booth</h3>' +
        tenants.map(t =>
          '<div class="bar-row"><span class="tn">' + esc(t.name) + '</span>' +
          '<span class="bar-track"><span class="bar' + (t.n === S.orders.length ? '' : ' dim') + '" style="width:' + Math.max(4, Math.round(t.n / maxT * 100)) + '%"></span></span>' +
          '<span class="v">' + t.n + '</span></div>').join('') +
      '</div>' +
      '<div class="panel"><h3>Antrean per jam</h3>' +
        '<div class="hours">' + hours.map(x =>
          '<div class="hb' + (x[0] === busiest[0] ? ' max' : '') + '"><span class="n">' + x[1] + '</span>' +
          '<span class="b" style="height:' + Math.max(4, Math.round(x[1] / maxH * 100)) + '%"></span>' +
          '<span class="h">' + pad2(x[0]) + '</span></div>').join('') + '</div>' +
      '</div>' +
      '<div class="panel insight"><h3>Bacaan cepat</h3>' +
        '<ul class="tight">' +
          '<li>Jam tersibuk di sekitar <b>' + pad2(busiest[0]) + ':00</b>. Siapkan satu staf tambahan di jam tersebut.</li>' +
          '<li>' + (kitchenEvents > 0
            ? 'Dapur Penuh pernah aktif pada booth ini.'
            : 'Belum ada kejadian Dapur Penuh. Coba nyalakan dari dasbor penjual.') + '</li>' +
          '<li>Setiap booth punya QR sendiri: <span class="mono">#pembeli/kode-booth</span>. Daftarkan booth baru via <a href="#daftar">Buka Booth</a>.</li>' +
        '</ul>' +
      '</div>' +
    '</div>' +
  '</section>';
}

/* ---------- live tick ---------- */
function liveTick(){
  if (!S) return;
  if (view() === 'beranda'){
    const live = activeOrders().find(o => o.status === 'processing') || activeOrders().slice(-1)[0] || null;
    const n = $('[data-live-num]'), s = $('[data-live-sub]');
    if (n) n.textContent = live ? live.ticket : 'A-···';
    if (s) s.textContent = live ? estLabel(live) + ' · ' + activeCount() + ' antrean aktif' : 'Belum ada antrean aktif';
  }
  $$('[data-el]').forEach(el => {
    const o = S.orders.find(x => x.id === Number(el.dataset.el));
    if (o) el.textContent = elapsedLabel(o);
  });
}

/* ---------- init ---------- */
// Browser memblokir suara sebelum ada gestur user → buka kunci AudioContext
// pada sentuhan/klik pertama agar notifikasi real-time berbunyi (murni JS).
['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev =>
  document.addEventListener(ev, () => BazarQAudio.unlock(), { passive: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) BazarQAudio.unlock(); });
window.addEventListener('hashchange', () => {
  const next = boothFromUrl();
  if (next !== SLUG){ switchBooth(next); window.scrollTo(0,0); return; }
  if (S && adoptTicketFromUrl()){ renderAll(); window.scrollTo(0,0); return; }
  renderAll(); window.scrollTo(0,0);
});
/* ---------- background ambient UMKM (flat 2D, opacity 12%, gerak pelan) ----------
   Ikon garis tipis navy/azure: tenda booth, mangkuk, gelas, keranjang,
   kantong belanja, payung bazar. Non-interaktif & diabaikan screen reader. */
const AMBIENT_SHAPES = [
  '<svg viewBox="0 0 64 40"><rect x="4" y="4" width="56" height="8" rx="4" fill="#2563EB"/><rect x="8" y="12" width="4" height="26" fill="#0F172A"/><rect x="52" y="12" width="4" height="26" fill="#0F172A"/><rect x="8" y="24" width="48" height="14" rx="3" fill="none" stroke="#0F172A" stroke-width="3"/></svg>',
  '<svg viewBox="0 0 64 64"><path d="M8 28 h48 a24 22 0 0 1 -48 0z" fill="none" stroke="#0F172A" stroke-width="3"/><line x1="6" y1="28" x2="58" y2="28" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/><path d="M26 18 q4 -6 8 0 M36 18 q4 -6 8 0" stroke="#60A5FA" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 64 64"><path d="M22 10 h20 l-3 40 h-14z" fill="none" stroke="#0F172A" stroke-width="3"/><line x1="32" y1="10" x2="38" y2="2" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/><rect x="25" y="22" width="14" height="16" fill="#60A5FA" opacity=".55"/></svg>',
  '<svg viewBox="0 0 64 64"><path d="M12 24 h40 l-5 24 h-30z" fill="none" stroke="#0F172A" stroke-width="3"/><path d="M20 24 q12 -16 24 0" fill="none" stroke="#2563EB" stroke-width="3"/></svg>',
  '<svg viewBox="0 0 64 64"><path d="M20 22 h24 l-2 30 h-20z" fill="none" stroke="#0F172A" stroke-width="3"/><path d="M24 22 q8 -12 16 0" fill="none" stroke="#2563EB" stroke-width="3"/><circle cx="32" cy="38" r="5" fill="#60A5FA" opacity=".6"/></svg>',
  '<svg viewBox="0 0 64 64"><path d="M32 8 a20 12 0 0 1 0 24z" fill="none" stroke="#0F172A" stroke-width="3" transform="rotate(8 32 20)"/><line x1="32" y1="28" x2="32" y2="56" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="34" rx="24" ry="10" fill="none" stroke="#0F172A" stroke-width="3"/><ellipse cx="32" cy="30" rx="14" ry="6" fill="none" stroke="#60A5FA" stroke-width="3"/></svg>',
  '<svg viewBox="0 0 64 64"><rect x="14" y="26" width="36" height="8" rx="4" fill="#2563EB"/><circle cx="20" cy="44" r="5" fill="none" stroke="#0F172A" stroke-width="3"/><circle cx="44" cy="44" r="5" fill="none" stroke="#0F172A" stroke-width="3"/></svg>'
];
function mountGarland(){
  const g = document.getElementById('garlandTop');
  if (g && !g.innerHTML) g.innerHTML = illusGarland();
}
function mountAmbient(){
  if (document.querySelector('.ambient')) return;
  const spots = [
    [4,12,64],[82,8,80],[12,64,72],[86,58,60],
    [30,82,84],[62,86,68],[45,10,52],[72,34,46]
  ];
  const layer = document.createElement('div');
  layer.className = 'ambient';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = AMBIENT_SHAPES.map((s, i) => {
    const p = spots[i % spots.length];
    const dur = (7 + (i % 4) * 1.8).toFixed(1);
    return '<i style="left:' + p[0] + '%;top:' + p[1] + '%;width:' + p[2] + 'px;animation-duration:' + dur + 's;animation-delay:-' + (i * 1.3).toFixed(1) + 's">' + s + '</i>';
  }).join('');
  document.body.prepend(layer);
}

const btnReset = document.getElementById('btnReset');
if (btnReset) btnReset.addEventListener('click', resetDemo);
/* ---------- hamburger mobile: buka/tutup + tutup otomatis ---------- */
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
function setNav(open){
  if (!navToggle || !mainNav) return;
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.setAttribute('aria-label', open ? 'Tutup menu navigasi' : 'Buka menu navigasi');
  mainNav.classList.toggle('open', open);
}
if (navToggle && mainNav){
  navToggle.addEventListener('click', () => setNav(!mainNav.classList.contains('open')));
  mainNav.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); });
  document.addEventListener('click', e => {
    if (mainNav.classList.contains('open') && !e.target.closest('.top')) setNav(false);
  });
  window.addEventListener('hashchange', () => setNav(false));
}
setInterval(liveTick, 1000);
mountAmbient();
mountGarland();
load();
