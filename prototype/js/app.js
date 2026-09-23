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
  { id:'m1', name:'Ayam Geprek Level 5',   desc:'Nasi, lalapan, sambal bawang',   price:15000, active:true },
  { id:'m2', name:'Paket Geprek + Es Teh', desc:'Nasi, ayam geprek, es teh jumbo', price:20000, active:true },
  { id:'m3', name:'Tahu Krispi (5 pcs)',   desc:'Saus sambal kering',              price:8000,  active:true },
  { id:'m4', name:'Es Teh Jumbo',          desc:'Teh tubruk manis dingin',         price:5000,  active:true },
  { id:'m5', name:'Es Jeruk Peras',        desc:'Jeruk peras asli',                price:6000,  active:true },
];
const PIN_HASH_DEFAULT = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // sha256('1234')
const DEFAULT_PROFILE = { name:'Geprek Bintang', desc:'Booth UMKM demo · Gelar Karya UNNES', pinHash:PIN_HASH_DEFAULT, qrisImageUrl:'' };

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
  // QR harus bisa di-scan HP → URL publik. Kalau dibuka via localhost/IP lokal,
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

/* ---------- state ---------- */
let S = null;
let sel = {};
let stage = 'scan';
let lastPhone = '';
let toastTimer = null;
let prevSeq = 0;
let myPresenceRef = null;
let boothMissing = false;

/* ---------- sound engine ---------- */
const BazarQAudio = {
  ctx: null, enabled: true,
  init(){
    if (!this.ctx){ try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
    if (this.ctx && this.ctx.state === 'suspended'){ this.ctx.resume().catch(() => {}); }
  },
  unlock(){ this.init(); },
  _play(freqs, dur, vol = 0.22){
    if (!this.enabled) return;
    try {
      this.init();
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
  playOrderReady(){ this._play([523.25, 659.25, 783.99], 0.45); },
  playNewOrder(){   this._play([880, 1108.73],           0.30); },
  toggle(){         this.enabled = !this.enabled; }
};

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
    stateRef.set(S).catch(e => { console.error('BazarQ save error:', e); toast('Gagal simpan (rules/jaringan). Coba lagi.'); });
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
  S = null; sel = {}; stage = 'scan'; boothMissing = false;
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
    if (val && Array.isArray(val.orders) && val.profile){
      S = val;
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

    if (myOrder() && myOrder().status !== 'completed') stage = 'ticket';
    checkNotifs();
    renderAll();
    setupPresence();
  }).catch(err => {
    console.error('BazarQ Firebase error:', err);
    appEl.innerHTML =
      '<div class="loading-screen"><p style="color:#DC2626;text-align:center;padding:24px">' +
      'Gagal terhubung ke Firebase.<br>Periksa koneksi internet, lalu refresh halaman.</p></div>';
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
      if (el) el.textContent = n + ' device · ' + SLUG;
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
/** Render QR ASLI yang bisa di-scan kamera HP menuju URL order booth. */
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
    '<p class="qr-hint">Scan pakai kamera HP biasa — tanpa aplikasi. Tekan Tutup atau <kbd>Esc</kbd> untuk kembali.</p>';
  document.body.appendChild(overlay);
  renderRealQR($('#qrFullBox', overlay), url, 220);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', escH); };
  const escH  = e => { if (e.key === 'Escape') close(); };
  $('#btnCloseQR', overlay).addEventListener('click', close);
  document.addEventListener('keydown', escH);
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
function myOrder(){
  const id = Number(sessionStorage.getItem(K_MY()) || 0);
  return S.orders.find(o => o.id === id) || null;
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
  if (totalQty > 20){ toast('Maksimal 20 pcs per pesanan.'); return null; }
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
  try { sessionStorage.setItem(K_MY(), String(o.id)); } catch(e){}
  return o;
}

function confirmPaid(id){
  const o = S.orders.find(x => x.id === id);
  if (!o || o.paid) return;
  o.paid = true;
  o.status = 'processing';
  o.processingAt = Date.now();
  pushLog(S, 'proc', o.ticket + ' lunas dikonfirmasi kasir → diteruskan ke dapur.');
  save();
}

function setStatus(id, status){
  const o = S.orders.find(x => x.id === id);
  if (!o || o.status === status) return;
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
  try {
    sessionStorage.removeItem(K_MY());
    sessionStorage.removeItem(K_AUTH());
  } catch(e){}
  const keepProfile = S.profile, keepMenu = S.menu;
  S = freshState(keepProfile, keepMenu);
  if (SLUG === DEFAULT_SLUG) seedState(S);
  sel = {}; stage = 'scan'; lastPhone = '';
  prevSeq = S.seq;
  save(); renderAll(); toast('Booth ' + SLUG + ' direset. Semua device di booth ini ikut reset.');
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
    }
  }
  if (!o.waReady && o.status === 'ready'){
    o.waReady = true; save();
    BazarQAudio.playOrderReady();
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
    '<p class="tiny" style="margin:0 0 16px">Mungkin QR kedaluwarsa atau slug salah ketik. Buat booth baru gratis, atau kembali ke demo.</p>' +
    '<div class="btn-row"><a class="btn btn-primary" href="#daftar">Buat Booth Baru</a>' +
    '<a class="btn btn-ghost" href="#pembeli/' + DEFAULT_SLUG + '">Buka Demo</a></div>' +
  '</div></section>';
}
function renderAll(){
  if (boothMissing){ renderNotFound(); return; }
  if (!S) return;
  const r = view();
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
    ['Scan QR', 'Standee QR di booth, buka lewat browser HP. Tanpa install aplikasi.'],
    ['Pilih menu', 'Tandai pesanan dan masukkan nomor WhatsApp.'],
    ['Terima tiket', 'Nomor antrean dan estimasi tunggu langsung tampil.'],
    ['Bebas jelajah', 'Notifikasi WA masuk saat tinggal 2 nomor.'],
    ['Ambil pesanan', 'Tunjukkan tiket saat pesanan siap.']
  ];
  appEl.innerHTML =
  '<section class="hero">' +
    '<div class="hero-grid">' +
      '<div>' +
        '<span class="badge"><span class="dot"></span>Demo langsung &middot; Gelar Karya Technopreneurship UNNES</span>' +
        '<h1>Antrean bazar pindah ke <em>HP</em>.</h1>' +
        '<p class="lede">Scan QR di booth, pilih menu, dapat nomor antrean dan estimasi waktu. Pembeli bebas jelajah — dagangan tetap terkendali.</p>' +
        '<div class="cta-row">' +
          '<a class="btn btn-primary" href="#pembeli/' + esc(SLUG) + '">Coba sebagai Pembeli</a>' +
          '<a class="btn btn-ghost" href="#merchant/' + esc(SLUG) + '">Buka Merchant</a>' +
          '<a class="btn btn-ghost" href="#daftar">Buka Booth Sendiri +</a>' +
        '</div>' +
        '<p class="tiny" style="margin-top:10px">Booth aktif: <b class="mono">' + esc(SLUG) + '</b> · <b>' + esc(BOOTH().name) + '</b></p>' +
      '</div>' +
      '<div>' +
        '<div class="stub print">' +
          '<div class="stub-glow"></div>' +
          '<div class="row"><span class="cap">Sedang dipanggil</span><span class="chip">' + esc(BOOTH().name) + '</span></div>' +
          '<div class="num" data-live-num>' + (live ? esc(live.ticket) : 'A-···') + '</div>' +
          '<div class="row sub"><span data-live-sub>' + (live ? estLabel(live) + ' &middot; ' + activeCount() + ' antrean aktif' : 'Belum ada antrean aktif') + '</span><span class="mono">BazarQ</span></div>' +
        '</div>' +
        '<p class="stub-cap">Tiket contoh booth <b class="mono">' + esc(SLUG) + '</b>. Sinkron langsung antar device.</p>' +
      '</div>' +
    '</div>' +
  '</section>' +
  '<section class="sec">' +
    '<h2>Kendala lama, jawaban sederhana</h2>' +
    '<p class="sub">Di bazar dan pasar kaget, antrean fisik membuat pembeli pergi dan UMKM kehilangan penjualan. BazarQ menggantinya dengan nomor antrean digital yang berjalan di HP standar — tanpa aplikasi, tanpa akun.</p>' +
    '<div class="vs">' +
      '<div class="card"><h3>Tanpa BazarQ</h3><ul class="tight">' +
        '<li>Antrean fisik tidak tertata di depan booth.</li>' +
        '<li>Pembeli pergi karena tidak tahu estimasi tunggu.</li>' +
        '<li>Dapur kewalahan saat lonjakan pengunjung.</li>' +
      '</ul></div>' +
      '<div class="card good"><h3>Dengan BazarQ</h3><ul class="tight">' +
        '<li>Nomor antrean dan estimasi langsung di HP pembeli.</li>' +
        '<li>Pembeli bebas menjelajah, dipanggil lewat notifikasi.</li>' +
        '<li>Tombol Dapur Penuh menjaga kualitas saat ramai.</li>' +
      '</ul></div>' +
    '</div>' +
  '</section>' +
  '<section class="sec">' +
    '<h2>Alur pembeli, dari scan sampai ambil</h2>' +
    '<p class="sub">Lima langkah inilah yang didemokan langsung di stand, dari awal sampai akhir.</p>' +
    '<div class="steps">' + flow.map((s,i) =>
      '<div class="step"><span class="n">0' + (i+1) + '</span><b>' + s[0] + '</b><p>' + s[1] + '</p></div>'
    ).join('') + '</div>' +
  '</section>' +
  '<section class="sec">' +
    '<h2>Pilih peran untuk demo</h2>' +
    '<p class="sub">Buka peran berbeda di HP berbeda — semua tersinkron real-time lewat Firebase booth <b class="mono">' + esc(SLUG) + '</b>.</p>' +
    '<div class="roles">' +
      '<a class="role" href="#pembeli/' + esc(SLUG) + '"><span class="t">Pembeli</span><span class="d">Pesan tanpa aplikasi, pantau nomor antrean dan notifikasinya secara live.</span><span class="go">Buka tab pembeli &rarr;</span></a>' +
      '<a class="role" href="#merchant/' + esc(SLUG) + '"><span class="t">Merchant UMKM</span><span class="d">Panggil antrean, ubah status pesanan, tampilkan QR standee, atur Dapur Penuh.</span><span class="go">Buka dashboard merchant &rarr;</span></a>' +
      '<a class="role" href="#eo"><span class="t">Event Organizer</span><span class="d">Pantau volume antrean lintas tenant dan jam sibuk event secara keseluruhan.</span><span class="go">Buka dasbor EO &rarr;</span></a>' +
      '<a class="role" href="#daftar"><span class="t">Buka Booth Sendiri</span><span class="d">Daftar 1 menit, dapat QR asli siap cetak untuk booth-mu sendiri.</span><span class="go">Daftar booth &rarr;</span></a>' +
    '</div>' +
  '</section>';
}

/* ---------- pembeli ---------- */
function renderPembeli(){
  const mine = myOrder();
  if (mine && mine.status !== 'completed') stage = 'ticket';
  if (!mine && stage === 'ticket') stage = 'scan';
  appEl.innerHTML =
  '<section class="view buyer-wrap">' +
    '<div class="booth-head">' +
      '<span class="booth-ic" aria-hidden="true">🍗</span>' +
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
    '<div class="qr-card"><div id="qrScanBox" style="display:flex;justify-content:center"></div>' +
      '<div class="qr-note">QR asli booth <b class="mono">' + esc(SLUG) + '</b>. Scan pakai kamera HP → membuka halaman ini. Di demo, pakai tombol simulasi di bawah.</div>' +
      '<p class="qr-url mono" style="word-break:break-all">' + esc(orderUrl()) + '</p>' +
    '</div>' +
    '<button class="btn btn-primary wide" id="btnScan" type="button">Simulasi: scan QR standee</button>' +
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
  body.innerHTML =
  '<div class="panel">' +
    '<h2 class="menu-title">Pesan dulu, nomor langsung terbit</h2>' +
    '<div id="kitchenGate">' + (S.kitchenFull
      ? '<div class="warn"><b>⚠️ Dapur sedang penuh.</b> Estimasi +15 menit. Pesanan tetap diterima.</div>'
      : '') + '</div>' +
    '<div class="menu-list">' + menu.map(m =>
      '<div class="menu-row">' +
        '<div class="nm"><b>' + esc(m.name) + '</b><span class="ds">' + esc(m.desc || '') + '</span><span class="pr">' + rp(m.price) + '</span></div>' +
        '<div class="qty">' +
          '<button type="button" data-less="' + m.id + '" aria-label="Kurangi ' + esc(m.name) + '">−</button>' +
          '<span class="q" data-q="' + m.id + '">' + (sel[m.id] || 0) + '</span>' +
          '<button type="button" data-more="' + m.id + '" aria-label="Tambah ' + esc(m.name) + '">+</button>' +
        '</div>' +
      '</div>').join('') +
    '</div>' +
    '<div class="field">' +
      '<label for="waPhone">Nomor WhatsApp</label>' +
      '<input class="input" id="waPhone" inputmode="tel" placeholder="0812 3456 7890" value="' + esc(lastPhone) + '">' +
      '<div class="field-err" id="phoneErr" hidden>Isi nomor WhatsApp yang valid, contoh 0812 3456 7890.</div>' +
    '</div>' +
    '<div class="total-row"><span>Total pesanan</span><span class="rp" data-total>' + rp(total) + '</span></div>' +
    '<div class="field"><label>Metode pembayaran (verifikasi di kasir)</label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="radio" name="pay" value="qris" checked> 📲 QRIS / E-Wallet (scan QR toko)</label>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-top:6px"><input type="radio" name="pay" value="cash"> 💵 Tunai di kasir</label>' +
      (BOOTH().qrisImageUrl ? '<img src="' + esc(BOOTH().qrisImageUrl) + '" alt="QRIS toko" style="max-width:220px;border-radius:12px;margin-top:10px;border:1px solid #e2e8f0">' : '<p class="tiny">QRIS toko tampil di sini setelah merchant mengisi URL gambar QRIS di dashboard kasir.</p>') +
    '</div>' +
    '<button class="btn btn-primary wide menu-btn-gap" id="btnOrder" type="button">Kirim Pesanan &amp; Dapatkan Tiket</button>' +
    '<p class="tiny center" style="margin-top:10px">Status awal: <b>Menunggu Pembayaran</b>. Kasir tekan Konfirmasi Lunas → pesanan diteruskan ke dapur.</p>' +
  '</div>';
  body.addEventListener('click', e => {
    const more = e.target.closest('[data-more]');
    const less = e.target.closest('[data-less]');
    if (more){ sel[more.dataset.more] = (sel[more.dataset.more] || 0) + 1; updateMenuBits(body); }
    if (less){ const id = less.dataset.less; sel[id] = Math.max(0, (sel[id] || 0) - 1); updateMenuBits(body); }
  });
  $('#btnOrder').addEventListener('click', submitOrder);
}

function updateMenuBits(body){
  const menu = MENU();
  let total = 0, count = 0;
  menu.forEach(m => {
    const q = sel[m.id] || 0;
    total += m.price * q; count += q;
    const qEl = $('[data-q="' + m.id + '"]', body);
    if (qEl) qEl.textContent = q;
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
    ? '<div class="warn"><b>⚠️ Dapur sedang penuh.</b> Estimasi +15 menit. Pesanan tetap diterima.</div>'
    : '';
  const chip = $('#boothChip');
  if (chip){ chip.textContent = S.kitchenFull ? 'Dapur penuh' : 'Buka'; chip.className = 'chip ' + (S.kitchenFull ? 'off' : 'on'); }
}

function submitOrder(){
  const input = $('#waPhone');
  const digits = input.value.replace(/\D/g,'');
  const ok = /^(08\d{8,11}|628\d{8,11})$/.test(digits);
  if (!ok){ $('#phoneErr').hidden = false; input.classList.add('err'); input.focus(); return; }
  lastPhone = input.value;
  const norm = digits.indexOf('628') === 0 ? '0' + digits.slice(2) : digits;
  const pm = document.querySelector('input[name="pay"]:checked');
  const payMethod = pm ? pm.value : 'cash';
  const o = createOrder(norm, payMethod);
  if (!o){ toast('Menu kosong. Pilih minimal 1 item.'); return; }
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
  const waMsgs = S.log.filter(l => l.type === 'wa' && l.phone === o.phone).slice(0, 4);
  const soundLabel = () => (BazarQAudio.enabled ? '🔊' : '🔇') + ' Suara panggilan';
  body.innerHTML =
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
      '<div class="wa-cap">Simulasi notifikasi WhatsApp ke ' + maskPhone(o.phone) + ' · di produksi lewat gateway WA (Fonnte) sesuai PRD.</div>' +
      (waMsgs.length
        ? waMsgs.map(m => '<div class="bubble">' + esc(m.text) + '<span class="t">' + hhmm(m.at) + ' &middot; BazarQ</span></div>').join('')
        : '<div class="empty">Belum ada notifikasi. Muncul saat antrean tinggal 2 nomor dan saat pesanan siap.</div>') +
    '</div>' +
    '<div class="btn-row">' +
      '<button class="sound-btn ' + (BazarQAudio.enabled ? 'on' : '') + '" id="btnBuyerSound" type="button">' + soundLabel() + '</button>' +
      (done
        ? '<button class="btn btn-primary" id="btnAgain" type="button">Pesan lagi</button>' +
          '<a class="btn btn-ghost" href="#beranda">Beranda</a>'
        : '<a class="btn btn-ghost" href="#beranda">Kembali ke beranda</a>') +
    '</div>' +
  '</div>';

  const sbtn = $('#btnBuyerSound');
  if (sbtn) sbtn.addEventListener('click', () => {
    BazarQAudio.init();
    BazarQAudio.toggle();
    sbtn.className = 'sound-btn' + (BazarQAudio.enabled ? ' on' : '');
    sbtn.textContent = soundLabel();
  });
  if (done){
    $('#btnAgain').addEventListener('click', () => {
      stage = 'menu'; sel = {};
      try { sessionStorage.removeItem(K_MY()); } catch(e){}
      renderAll();
    });
  }
}

/* ---------- daftar booth (untuk orang lain) ---------- */
function renderDaftar(){
  appEl.innerHTML =
  '<section class="view buyer-wrap"><div class="panel">' +
    '<h2 class="menu-title">Buka booth-mu sendiri</h2>' +
    '<p class="tiny" style="margin:0 0 16px">Gratis untuk demo. Isi nama booth + PIN, sistem buatkan namespace data sendiri + <b>QR asli siap cetak</b> yang langsung membuka halaman order booth-mu.</p>' +
    '<div id="daftarForm">' +
      '<div class="field"><label for="fName">Nama booth</label>' +
      '<input class="input" id="fName" placeholder="cth: Kopi Rame" maxlength="40"></div>' +
      '<div class="field"><label for="fDesc">Deskripsi singkat</label>' +
      '<input class="input" id="fDesc" placeholder="cth: Booth kopi · bazar akhir pekan" maxlength="80"></div>' +
      '<div class="field"><label for="fPin">PIN merchant (4–6 digit)</label>' +
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
    if (!/^\d{4,6}$/.test(pin)){ err.hidden = false; err.textContent = 'PIN harus 4–6 digit angka.'; return; }
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
          '<a class="btn btn-primary" href="#merchant/' + esc(slug) + '">Buka Dashboard Merchant</a>' +
          '<a class="btn btn-ghost" href="#pembeli/' + esc(slug) + '">Tes sebagai Pembeli</a>' +
        '</div>' +
        '<p class="tiny" style="margin-top:10px">PIN merchant: <b class="mono">' + esc(pin) + '</b> · slug: <b class="mono">' + esc(slug) + '</b><br>' +
        'Cetak QR: screenshot QR di atas, atau buka dashboard merchant → <b>QR Standee</b> → fullscreen. Link merchant (<span class="mono">' + esc(murl) + '</span>) jangan disebar ke pembeli.</p>';
      renderRealQR($('#qrNewBox'), ourl, 200);
      toast('Booth ' + slug + ' jadi! QR sudah bisa di-scan.');
    } catch(e){
      console.error(e);
      err.hidden = false; err.textContent = 'Gagal membuat booth. Periksa rules Firebase (backend/database.rules.json), lalu coba lagi.';
      btn.disabled = false; btn.textContent = 'Buat Booth & Tampilkan QR';
    }
  });
}

/* ---------- merchant: View B Kasir + View C Dapur (sesuai PRD) ---------- */
let merchantTab = 'kasir';
function renderMerchant(){
  if (sessionStorage.getItem(K_AUTH()) !== '1'){ renderPinLogin(); return; }
  const waitUnpaid = S.orders.filter(o => o.status === 'waiting' && !o.paid);
  const proc  = S.orders.filter(o => o.status === 'processing');
  const ready = S.orders.filter(o => o.status === 'ready');
  const done  = completed();
  const avg   = avgMins();
  const menuAll = MENU_ALL();

  const ocCashier = o =>
    '<div class="ocard">' +
      '<div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono">' + rp(o.total) + ' · ' + (o.payMethod === 'qris' ? '📲 QRIS' : '💵 Tunai') + '</span></div>' +
      '<div class="items">' + o.items.map(i => i.qty + '× ' + esc(i.name)).join(' &middot; ') +
        '<br><span class="tiny">WA: ' + esc(maskPhone(o.phone)) + ' · ' + hhmm(o.createdAt) + '</span></div>' +
      '<div class="act">' +
        '<button class="btn btn-primary btn-sm" data-paid="' + o.id + '" type="button">✅ Konfirmasi Lunas</button>' +
        '<span class="st waiting">Belum Bayar</span>' +
      '</div>' +
    '</div>';
  const ocKitchen = o =>
    '<div class="ocard">' +
      '<div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</span></div>' +
      '<div class="items">' + o.items.map(i => i.qty + '× ' + esc(i.name)).join(' &middot; ') +
        '<span class="mono tot">' + rp(o.total) + '</span></div>' +
      '<div class="act">' +
        (o.status === 'processing' ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':ready" type="button">🔔 Pesanan Siap / Panggil</button>' : '') +
        (o.status === 'ready'      ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':completed" type="button">✅ Diserahkan / Selesai</button>' : '') +
      '</div>' +
    '</div>';

  appEl.innerHTML =
  '<section class="view">' +
    '<div class="m-head">' +
      '<div>' +
        '<h2>Dashboard ' + esc(BOOTH().name) + '</h2>' +
        '<p class="sub2">Booth <b class="mono">' + esc(SLUG) + '</b> · View B (Kasir) + View C (Dapur) sesuai PRD.</p>' +
      '</div>' +
      '<div class="m-actions">' +
        '<button class="btn btn-ghost btn-sm" id="btnQRFull" type="button">QR Standee ⬈</button>' +
        '<button class="sound-btn ' + (BazarQAudio.enabled ? 'on' : '') + '" id="btnMSound" type="button">' + (BazarQAudio.enabled ? '🔊' : '🔇') + ' Suara</button>' +
        '<button class="switch ' + (S.kitchenFull ? 'on' : '') + '" id="btnKitchen" type="button" aria-pressed="' + S.kitchenFull + '">' +
          '<span class="track" aria-hidden="true"></span><span>🔥 Dapur Penuh (+15 mnt)</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    (S.kitchenFull
      ? '<div class="warn big"><b>🔥 Dapur Penuh aktif.</b> Estimasi tiket baru +15 menit (smart throttling PRD).</div>'
      : '') +
    '<div class="btn-row" style="margin:12px 0">' +
      '<button class="btn btn-sm ' + (merchantTab === 'kasir' ? 'btn-primary' : 'btn-ghost') + '" id="tabKasir" type="button">💵 Kasir (' + waitUnpaid.length + ' menunggu)</button>' +
      '<button class="btn btn-sm ' + (merchantTab === 'dapur' ? 'btn-primary' : 'btn-ghost') + '" id="tabDapur" type="button">🍳 Dapur (' + (proc.length + ready.length) + ' aktif)</button>' +
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
        (waitUnpaid.length ? waitUnpaid.map(ocCashier).join('') : '<div class="empty">Tidak ada antrean menunggu. Tunjukkan QR standee.</div>') + '</div>' +
      '<div class="col"><h3>Walk-in Manual <span class="count">kasir</span></h3><div class="panel">' +
        '<p class="tiny">Catat pembeli tanpa HP → langsung lunas → diteruskan ke dapur.</p>' +
        '<div class="field"><label>Item (cth: m1:2,m4:1)</label><input class="input mono" id="wiItems" placeholder="m1:1"></div>' +
        '<div class="field"><label>Nomor WA (opsional)</label><input class="input" id="wiPhone" placeholder="08xx"></div>' +
        '<button class="btn btn-primary btn-sm" id="btnWalkin" type="button">+ Catat Walk-in (Lunas)</button>' +
        '<p class="tiny">ID menu: ' + menuAll.map(m => m.id + '=' + esc(m.name)).join(', ') + '</p></div>' +
      '<h3 class="mt">Menu Habis (1-tap)</h3><div class="panel">' +
        menuAll.map(m => '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-menu="' + m.id + '"' + (m.active !== false ? ' checked' : '') + '> ' + esc(m.name) + ' <span class="mono tiny">' + rp(m.price) + '</span></label>').join('') + '</div>' +
      '<h3 class="mt">QRIS Toko (Static QRIS Opsi 1)</h3><div class="panel">' +
        '<div class="field"><label>URL gambar QRIS</label><input class="input mono" id="qrisUrl" value="' + esc(BOOTH().qrisImageUrl || '') + '" placeholder="https://.../qris.png"></div>' +
        '<button class="btn btn-ghost btn-sm" id="btnQris" type="button">Simpan QRIS</button></div>' +
      '</div></div>'
    : '<div class="board">' +
      '<div class="col"><h3>Diproses <span class="count">' + proc.length + '</span></h3>' +
        (proc.length ? proc.map(ocKitchen).join('') : '<div class="empty">Belum ada yang diproses. Kasir harus Konfirmasi Lunas dulu.</div>') + '</div>' +
      '<div class="col"><h3>Siap Diambil <span class="count">' + ready.length + '</span></h3>' +
        (ready.length ? ready.map(ocKitchen).join('') : '<div class="empty">Belum ada pesanan siap.</div>') + '</div>' +
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
    toast(S.kitchenFull ? '🔥 Dapur Penuh aktif: estimasi +15 mnt.' : 'Dapur Penuh dimatikan.');
  });
  $('#btnQRFull').addEventListener('click', showQRFullscreen);
  $('#btnMSound').addEventListener('click', () => {
    BazarQAudio.toggle();
    const btn = $('#btnMSound');
    btn.className = 'sound-btn' + (BazarQAudio.enabled ? ' on' : '');
    btn.textContent = (BazarQAudio.enabled ? '🔊' : '🔇') + ' Suara';
  });
  $$('[data-paid]').forEach(b => b.addEventListener('click', () => {
    confirmPaid(Number(b.dataset.paid));
    merchantTab = 'kasir'; renderAll();
    toast('Lunas dikonfirmasi → diteruskan ke dapur.');
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
    if (v && !/^https:\/\//i.test(v)){ toast('URL QRIS harus https://'); return; }
    S.profile.qrisImageUrl = v; save(); renderAll();
    toast('QRIS toko disimpan, tampil di checkout pembeli.');
  });
  const bw = $('#btnWalkin');
  if (bw) bw.addEventListener('click', () => {
    const raw = $('#wiItems').value.trim();
    const phone = $('#wiPhone').value.trim() || 'walk-in';
    const pairs = raw.split(',').map(s => s.trim().split(':')).filter(p => p[0]);
    const menu = MENU_ALL();
    const items = pairs.map(([id, q]) => {
      const m = menu.find(x => x.id === id.trim());
      if (!m) return null;
      return { id:m.id, qty:Math.max(1, Number(q) || 1), name:m.name, price:m.price };
    }).filter(Boolean);
    if (!items.length){ toast('Format walk-in: m1:2,m4:1'); return; }
    S.seq += 1;
    S.orders.push({ id:S.seq, ticket:tk(S.seq), phone, items, total:items.reduce((a,i) => a + i.price * i.qty, 0), status:'processing', paid:true, payMethod:'cash', createdAt:Date.now(), processingAt:Date.now(), wa2:true, waReady:true });
    pushLog(S, 'proc', tk(S.seq) + ' walk-in dicatat kasir (lunas tunai) → dapur.');
    save(); renderAll(); toast('Walk-in ' + tk(S.seq) + ' masuk dapur.');
  });
}

function renderPinLogin(){
  appEl.innerHTML =
  '<section class="view buyer-wrap">' +
    '<div class="panel">' +
      '<h2 class="menu-title">Masuk dashboard ' + esc(BOOTH().name) + '</h2>' +
      '<p class="tiny" style="margin:0 0 16px">Booth <b class="mono">' + esc(SLUG) + '</b> · login pakai PIN booth — tanpa email, tanpa kata sandi panjang.</p>' +
      '<div class="field" style="margin-top:0">' +
        '<label for="pin">PIN booth</label>' +
        '<input class="input pin" id="pin" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off">' +
        '<div class="field-err" id="pinErr" hidden>PIN salah. Coba lagi.</div>' +
      '</div>' +
      '<button class="btn btn-primary wide" id="btnPin" type="button">Masuk</button>' +
      (SLUG === DEFAULT_SLUG ? '<p class="tiny center" style="margin-top:10px">PIN demo: <b>1234</b></p>' : '') +
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
  const tenants = [{ name:BOOTH().name + ' (booth ' + SLUG + ', live)', n:S.orders.length }].concat(contoh);
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
      '<h2>Dasbor Event Organizer</h2>' +
      '<p class="sub2">Agregat antrean lintas tenant. Data live dari booth <b class="mono">' + esc(SLUG) + '</b>, sisanya contoh.</p>' +
    '</div></div>' +
    '<div class="stat-chips">' +
      '<div class="stat"><span class="v">' + total + '</span><span class="l">total antrean event</span></div>' +
      '<div class="stat"><span class="v">' + activeCount() + '</span><span class="l">antrean berjalan</span></div>' +
      '<div class="stat"><span class="v">' + pad2(busiest[0]) + ':00</span><span class="l">jam tersibuk</span></div>' +
      '<div class="stat"><span class="v">' + kitchenEvents + '×</span><span class="l">dapur penuh menyala</span></div>' +
    '</div>' +
    '<div class="grid2">' +
      '<div class="panel"><h3>Volume antrean per tenant</h3>' +
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
            ? 'Dapur Penuh pernah menyala pada booth ini.'
            : 'Belum ada kejadian Dapur Penuh. Coba nyalakan dari dashboard merchant.') + '</li>' +
          '<li>Setiap booth punya QR sendiri: <span class="mono">#pembeli/{slug}</span>. Daftarkan booth baru via <a href="#daftar">Buka Booth</a>.</li>' +
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
  renderAll(); window.scrollTo(0,0);
});
const btnReset = document.getElementById('btnReset');
if (btnReset) btnReset.addEventListener('click', resetDemo);
setInterval(liveTick, 1000);
load();
