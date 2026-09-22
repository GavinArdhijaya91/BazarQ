'use strict';

/* ============================================================
   BazarQ · Prototipe Demo Gelar Karya Technopreneurship UNNES
   State dibagikan ke semua device via Firebase Realtime DB.
   myTicket & merchantAuth tetap di sessionStorage (device-local).
   ============================================================ */

// --- Firebase init (SDK dimuat dari CDN di index.html) ---
firebase.initializeApp(window.FIREBASE_CONFIG);
const db       = firebase.database();
const stateRef = db.ref('bazarq/state');

const K_MY   = 'bazarq.myTicket';
const K_AUTH = 'bazarq.merchantAuth';

const PREP_MIN = 4;
const PIN      = '1234';

const BOOTH = { name:'Geprek Bintang', desc:'Booth UMKM demo · Gelar Karya UNNES' };

const MENU = [
  { id:'m1', name:'Ayam Geprek Level 5',   desc:'Nasi, lalapan, sambal bawang',   price:15000 },
  { id:'m2', name:'Paket Geprek + Es Teh', desc:'Nasi, ayam geprek, es teh jumbo', price:20000 },
  { id:'m3', name:'Tahu Krispi (5 pcs)',   desc:'Saus sambal kering',              price:8000  },
  { id:'m4', name:'Es Teh Jumbo',          desc:'Teh tubruk manis dingin',         price:5000  },
  { id:'m5', name:'Es Jeruk Peras',        desc:'Jeruk peras asli',                price:6000  },
];

/* ---------- helpers ---------- */
const appEl = document.getElementById('app');
const $     = (s, el=document) => el.querySelector(s);
const $$    = (s, el=document) => Array.from(el.querySelectorAll(s));
const rp    = n => 'Rp' + n.toLocaleString('id-ID');
const pad2  = n => String(n).padStart(2,'0');
const pad3  = n => String(n).padStart(3,'0');
const tk    = id => 'A-' + pad3(id);
const hhmm  = t => new Date(t).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
const esc   = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maskPhone = p => { const d = String(p).replace(/\D/g,''); return d.length <= 6 ? d : d.slice(0,4) + '\u2022\u2022\u2022' + d.slice(-3); };
const mmss  = ms => { const s = Math.max(0, Math.floor(ms/1000)); return pad2(Math.floor(s/60)) + ':' + pad2(s%60); };

/* ---------- state ---------- */
let S         = null;
let sel       = {};
let stage     = 'scan';   // scan | menu | ticket
let lastPhone = '';
let toastTimer = null;
let prevSeq   = 0;        // untuk deteksi pesanan baru (suara merchant)
let myPresenceRef = null;

/* ---------- sound engine ---------- */
const BazarQAudio = {
  ctx: null, enabled: true,
  init(){
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },
  _play(freqs, dur, vol = 0.22){
    if (!this.enabled) return;
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
  },
  /* C5–E5–G5 arpeggio — pesanan siap untuk pembeli */
  playOrderReady(){ this._play([523.25, 659.25, 783.99], 0.45); },
  /* Double-beep A5–C#6 — pesanan baru masuk untuk merchant */
  playNewOrder(){   this._play([880, 1108.73],           0.30); },
  toggle(){         this.enabled = !this.enabled; }
};

/* ---------- state bersama & seed ---------- */
function freshState(){ return { v:1, seq:0, kitchenFull:false, orders:[], log:[] }; }

function pushLog(st, type, text, extra){
  st.log.unshift(Object.assign({ at:Date.now(), type, text }, extra || {}));
  st.log = st.log.slice(0, 40);
}

function seedState(st){
  const now = Date.now(), M = 60000;
  const mk = (id, minsAgo, status, phone, its, stamps) => {
    const items = its.map(pair => {
      const m = MENU.find(x => x.id === pair[0]);
      return { id:m.id, qty:pair[1], name:m.name, price:m.price };
    });
    return Object.assign({
      id, phone, items, status,
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
    { at:now-1*M,  type:'new',     text:'A-007 masuk dari 0857\u2022\u2022\u2022117' },
    { at:now-30*M, type:'ok',      text:'A-002 selesai diambil.' },
    { at:now-35*M, type:'kitchen', text:'Dapur Penuh dimatikan. Pesanan baru diterima lagi.' },
    { at:now-55*M, type:'ok',      text:'A-001 selesai diambil.' }
  ];
}

/* ---------- Firebase save ---------- */
function save(){
  S.v = (S.v || 0) + 1;
  stateRef.set(S).catch(e => console.error('BazarQ save error:', e));
}

/* ---------- Firebase load & listener ---------- */
function load(){
  appEl.innerHTML =
    '<div class="loading-screen">' +
      '<div class="loading-spinner"></div>' +
      '<p style="color:var(--sky);font-size:.9rem;margin-top:12px">Menghubungkan ke BazarQ...</p>' +
    '</div>';

  stateRef.once('value').then(snap => {
    const val = snap.val();
    if (val && Array.isArray(val.orders)){
      S = val;
    } else {
      S = freshState(); seedState(S);
      stateRef.set(S);
    }
    prevSeq = S.seq;

    // Real-time listener — update semua device saat state berubah
    stateRef.on('value', snap => {
      const next = snap.val();
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
      '<div class="loading-screen">' +
        '<p style="color:#DC2626;text-align:center;padding:24px">' +
          'Gagal terhubung ke Firebase.<br>Periksa koneksi internet, lalu refresh halaman.' +
        '</p>' +
      '</div>';
  });
}

/* ---------- presence (hitung device terhubung) ---------- */
function setupPresence(){
  const presRef = db.ref('bazarq/presence');
  myPresenceRef = presRef.push();
  myPresenceRef.onDisconnect().remove();
  myPresenceRef.set({ role: route(), at: Date.now() });

  presRef.on('value', snap => {
    const n = snap.numChildren();
    const el = document.getElementById('presenceCount');
    if (el) el.textContent = n + ' device';
  });
}

/* ---------- onSync ---------- */
function onSync(){
  // Suara merchant: pesanan baru masuk
  if (route() === 'merchant' && sessionStorage.getItem(K_AUTH) === '1' && S.seq > prevSeq){
    BazarQAudio.playNewOrder();
  }
  prevSeq = S.seq;
  checkNotifs();
  if (route() === 'pembeli' && stage === 'menu'){ refreshMenuGate(); return; }
  renderAll();
}

/* ---------- QR simulasi ---------- */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function qrSVG(size = 168){
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
    'aria-label="Pola QR simulasi standee booth" shape-rendering="crispEdges" fill="#0F172A">' +
    rects + finder(0,0) + finder(N-7,0) + finder(0,N-7) + '</svg>';
}

/* ---------- QR fullscreen (merchant standee) ---------- */
function showQRFullscreen(){
  BazarQAudio.init(); // init AudioContext lewat user gesture
  const url = window.DEMO_URL || 'bazarq.vercel.app';
  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay'; overlay.id = 'qrOverlay';
  overlay.innerHTML =
    '<button class="btn btn-ghost btn-sm btn-close-qr" id="btnCloseQR">Tutup &times;</button>' +
    '<p class="qr-big-title">Scan untuk Memesan</p>' +
    '<p class="qr-big-sub">' + esc(BOOTH.name) + ' &middot; BazarQ</p>' +
    '<div class="qr-big-svg">' + qrSVG(220) + '</div>' +
    '<p class="qr-url">' + esc(url) + '/#pembeli</p>' +
    '<p class="qr-hint">Tekan tombol Tutup atau <kbd>Esc</kbd> untuk kembali ke dashboard</p>';
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', escH); };
  const escH  = e => { if (e.key === 'Escape') close(); };
  $('#btnCloseQR', overlay).addEventListener('click', close);
  document.addEventListener('keydown', escH);
}

/* ---------- toast ---------- */
function toast(msg){
  const t = $('#toast');
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
  return S.kitchenFull ? m * 2 : m;
}
const estLabel = o => o.status === 'ready' ? 'Siap' : '\u00B1' + estMinFor(o) + ' mnt';

const completed = () => S.orders.filter(o => o.status === 'completed');
const revenue   = () => completed().reduce((a,o) => a + o.total, 0);
function avgMins(){
  const c = completed();
  if (!c.length) return null;
  return Math.round(c.reduce((a,o) => a + ((o.completedAt || Date.now()) - o.createdAt), 0) / c.length / 60000);
}
function myOrder(){
  const id = Number(sessionStorage.getItem(K_MY) || 0);
  return S.orders.find(o => o.id === id) || null;
}
function elapsedLabel(o){
  if (o.status === 'completed') return hhmm(o.completedAt) + ' selesai';
  if (o.status === 'ready')     return 'siap ' + hhmm(o.readyAt);
  return mmss(Date.now() - (o.processingAt || o.createdAt));
}

/* ---------- aksi ---------- */
function createOrder(phone){
  if (S.kitchenFull) return null;
  S.seq += 1;
  const items = Object.entries(sel).filter(([,q]) => q > 0).map(([mid,qty]) => {
    const m = MENU.find(x => x.id === mid);
    return { id:mid, qty, name:m.name, price:m.price };
  });
  const o = {
    id:S.seq, ticket:tk(S.seq), phone, items,
    total:items.reduce((a,i) => a + i.price * i.qty, 0),
    status:'waiting', createdAt:Date.now(), wa2:false, waReady:false
  };
  S.orders.push(o);
  pushLog(S, 'new', o.ticket + ' masuk dari ' + maskPhone(phone));
  save();
  sessionStorage.setItem(K_MY, String(o.id));
  return o;
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
    ? 'Dapur Penuh dinyalakan. Pesanan baru ditahan.'
    : 'Dapur Penuh dimatikan. Pesanan baru diterima lagi.');
  save();
}

function resetDemo(){
  try {
    sessionStorage.removeItem(K_MY);
    sessionStorage.removeItem(K_AUTH);
  } catch(e){}
  S = freshState(); seedState(S); sel = {}; stage = 'scan'; lastPhone = '';
  prevSeq = S.seq;
  save(); renderAll(); toast('Demo direset ke kondisi awal. Semua device ikut reset.');
}

/* Simulasi WA — sekali per kondisi */
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

/* ---------- router ---------- */
const VIEWS = { beranda:renderLanding, pembeli:renderPembeli, merchant:renderMerchant, eo:renderEO };
const route = () => { const h = location.hash.replace(/^#/, ''); return VIEWS[h] ? h : 'beranda'; };

function renderAll(){
  const r = route();
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === r));
  if (myPresenceRef) myPresenceRef.update({ role: r });
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
          '<a class="btn btn-primary" href="#pembeli" id="ctaBuyer">Coba sebagai Pembeli</a>' +
          '<a class="btn btn-ghost" href="#merchant" id="ctaMerchant">Buka Merchant</a>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<div class="stub print">' +
          '<div class="stub-glow"></div>' +
          '<div class="row"><span class="cap">Sedang dipanggil</span><span class="chip">' + esc(BOOTH.name) + '</span></div>' +
          '<div class="num" data-live-num>' + (live ? live.ticket : 'A-\u00B7\u00B7\u00B7') + '</div>' +
          '<div class="row sub"><span data-live-sub>' + (live ? estLabel(live) + ' &middot; ' + activeCount() + ' antrean aktif' : 'Belum ada antrean aktif') + '</span><span class="mono">BazarQ</span></div>' +
        '</div>' +
        '<p class="stub-cap">Tiket contoh. Angkanya sinkron langsung dengan semua device yang terhubung saat demo.</p>' +
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
    '<p class="sub">Buka peran berbeda di HP berbeda — semua tersinkron real-time lewat Firebase.</p>' +
    '<div class="roles">' +
      '<a class="role" href="#pembeli" id="roleBuyer"><span class="t">Pembeli</span><span class="d">Pesan tanpa aplikasi, pantau nomor antrean dan notifikasinya secara live.</span><span class="go">Buka tab pembeli &rarr;</span></a>' +
      '<a class="role" href="#merchant" id="roleMerchant"><span class="t">Merchant UMKM</span><span class="d">Panggil antrean, ubah status pesanan, tampilkan QR standee, atur Dapur Penuh.</span><span class="go">Buka dashboard merchant &rarr;</span></a>' +
      '<a class="role" href="#eo" id="roleEO"><span class="t">Event Organizer</span><span class="d">Pantau volume antrean lintas tenant dan jam sibuk event secara keseluruhan.</span><span class="go">Buka dasbor EO &rarr;</span></a>' +
    '</div>' +
  '</section>' +

  '<section class="sec">' +
    '<h2>Demo 4 device di stand</h2>' +
    '<div class="how"><ol>' +
      '<li><b>Merchant</b>: buka <code>#merchant</code> di laptop/tablet &rarr; tekan <b>QR Standee</b> untuk tampilkan QR fullscreen.</li>' +
      '<li><b>Pembeli 1, 2, 3</b>: scan QR lewat kamera HP &rarr; langsung ke halaman pesanan tanpa install aplikasi.</li>' +
      '<li>Merchant tekan <b>Proses</b> &rarr; status di HP semua pembeli berubah real-time dalam &lt;1 detik.</li>' +
      '<li>Tekan <b>Reset demo</b> di kanan atas sebelum pengunjung berikutnya. Semua device ikut reset.</li>' +
    '</ol></div>' +
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
      '<span class="booth-ic" aria-hidden="true">\uD83C\uDF57</span>' +
      '<div><b>' + esc(BOOTH.name) + '</b><div class="booth-sub">' + esc(BOOTH.desc) + '</div></div>' +
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
    '<div class="qr-card">' + qrSVG() +
      '<div class="qr-note">Standee QR di booth. Di demo ini, scan disimulasikan lewat tombol di bawah.</div>' +
    '</div>' +
    '<button class="btn btn-primary wide" id="btnScan" type="button">Simulasi: scan QR standee</button>' +
  '</div>' +
  '<p class="tiny center" style="margin-top:12px">Tanpa pasang aplikasi, tanpa buat akun. Muat di bawah 100 KB agar tetap lancar saat jaringan bazar padat.</p>';
  $('#btnScan').addEventListener('click', () => { BazarQAudio.init(); stage = 'menu'; renderPembeli(); });
}

function renderMenu(body){
  if (!Object.keys(sel).length) sel = { m2:1 };
  let total = 0;
  MENU.forEach(m => { total += m.price * (sel[m.id] || 0); });
  body.innerHTML =
  '<div class="panel">' +
    '<h2 class="menu-title">Pesan dulu, nomor langsung terbit</h2>' +
    '<div id="kitchenGate">' + (S.kitchenFull
      ? '<div class="warn"><b>Dapur sedang penuh.</b> Pesanan baru ditahan supaya kualitas tetap terjaga. Coba lagi beberapa menit.</div>'
      : '') + '</div>' +
    '<div class="menu-list">' + MENU.map(m =>
      '<div class="menu-row">' +
        '<div class="nm"><b>' + esc(m.name) + '</b><span class="ds">' + esc(m.desc) + '</span><span class="pr">' + rp(m.price) + '</span></div>' +
        '<div class="qty">' +
          '<button type="button" data-less="' + m.id + '" aria-label="Kurangi ' + esc(m.name) + '">\u2212</button>' +
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
    '<button class="btn btn-primary wide menu-btn-gap" id="btnOrder" type="button"' + (S.kitchenFull ? ' disabled' : '') + '>' + (S.kitchenFull ? 'Dapur penuh, pesanan ditahan' : 'Ambil nomor antrean') + '</button>' +
    '<p class="tiny center" style="margin-top:10px">Pesanan dibayar langsung di booth. BazarQ hanya mengatur antrean, bukan pembayaran.</p>' +
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
  let total = 0, count = 0;
  MENU.forEach(m => {
    const q = sel[m.id] || 0;
    total += m.price * q; count += q;
    const qEl = $('[data-q="' + m.id + '"]', body);
    if (qEl) qEl.textContent = q;
  });
  const t = $('[data-total]', body);
  if (t) t.textContent = rp(total);
  const b = $('#btnOrder', body);
  if (b){
    b.disabled = count === 0 || S.kitchenFull;
    b.textContent = S.kitchenFull ? 'Dapur penuh, pesanan ditahan' : 'Ambil nomor antrean';
  }
  const g = $('#kitchenGate', body);
  if (g) g.innerHTML = S.kitchenFull
    ? '<div class="warn"><b>Dapur sedang penuh.</b> Pesanan baru ditahan. Coba lagi beberapa menit.</div>'
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
  const o = createOrder(norm);
  if (!o){ toast('Dapur penuh. Pesanan belum bisa diterima.'); return; }
  stage = 'ticket'; sel = {};
  renderAll();
  toast('Tiket ' + o.ticket + ' terbit. Biarkan halaman ini terbuka untuk notifikasi.');
}

function renderTicket(body, o){
  if (!o) return;
  const done = o.status === 'completed';
  const st   = { waiting:1, processing:2, ready:3, completed:3 }[o.status];
  const waMsgs = S.log.filter(l => l.type === 'wa' && l.phone === o.phone).slice(0, 4);
  const soundLabel = () => (BazarQAudio.enabled ? '🔊' : '🔇') + ' Suara panggilan';
  body.innerHTML =
  '<div class="stub big print">' +
    '<div class="stub-glow"></div>' +
    '<div class="row"><span class="cap">Nomor antrean Anda</span><span class="chip">' + esc(BOOTH.name) + '</span></div>' +
    '<div class="num">' + esc(o.ticket) + '</div>' +
    '<div class="row sub"><span>' + estLabel(o) + '</span><span class="mono">' + rp(o.total) + '</span></div>' +
    '<div class="tear"></div>' +
    (done
      ? '<div class="pos">Pesanan selesai. Terima kasih sudah mampir!</div>'
      : '<div class="pos">Antrean ke ' + posOf(o) + ' dari ' + activeCount() + ' antrean aktif</div>') +
  '</div>' +
  '<div class="panel" style="margin-top:16px">' +
    '<div class="timeline">' +
      ['Diterima','Diproses','Siap'].map((t,i) =>
        '<div class="tl ' + (st > i+1 ? 'done' : st === i+1 ? 'now' : '') + '"><span class="bar"></span>' + t + '</div>').join('') +
    '</div>' +
    '<div class="items-box">' +
      o.items.map(i => '<div class="item-line"><span>' + i.qty + '\u00D7 ' + esc(i.name) + '</span><span class="mono">' + rp(i.price * i.qty) + '</span></div>').join('') +
      '<div class="item-line sum"><span>Total (bayar di booth)</span><span class="mono">' + rp(o.total) + '</span></div>' +
    '</div>' +
    (done ? '' : '<div class="wait-line">Menunggu <b class="mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</b></div>') +
    '<div class="wa">' +
      '<div class="wa-cap">Simulasi notifikasi WhatsApp ke ' + maskPhone(o.phone) + ' &middot; di produksi lewat gateway WA (Fonnte) sesuai PRD.</div>' +
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
    (done ? '<p class="tiny" style="margin-top:8px">Tiket selesai. Tombol Reset demo di kanan atas menyiapkan stand untuk pengunjung berikutnya.</p>' : '') +
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
      try { sessionStorage.removeItem(K_MY); } catch(e){}
      renderAll();
    });
  }
}

/* ---------- merchant ---------- */
function renderMerchant(){
  if (sessionStorage.getItem(K_AUTH) !== '1'){ renderPinLogin(); return; }
  const proc  = S.orders.filter(o => o.status === 'processing');
  const wait  = S.orders.filter(o => o.status === 'waiting');
  const ready = S.orders.filter(o => o.status === 'ready');
  const done  = completed();
  const avg   = avgMins();

  const statusLabel = { waiting:'Menunggu', processing:'Diproses', ready:'Siap', completed:'Selesai' };
  const oc = o =>
    '<div class="ocard">' +
      '<div class="top-row"><span class="tk">' + esc(o.ticket) + '</span><span class="el mono" data-el="' + o.id + '">' + elapsedLabel(o) + '</span></div>' +
      '<div class="items">' + o.items.map(i => i.qty + '\u00D7 ' + esc(i.name)).join(' &middot; ') +
        '<span class="mono tot">' + rp(o.total) + '</span></div>' +
      '<div class="act">' +
        (o.status === 'waiting'    ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':processing" type="button">Proses Pesanan</button>' : '') +
        (o.status === 'processing' ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':ready"      type="button">Siap Diambil &rarr;</button>' : '') +
        (o.status === 'ready'      ? '<button class="btn btn-primary btn-sm" data-set="' + o.id + ':completed"  type="button">Selesai / Diserahkan</button>' : '') +
        '<span class="st ' + o.status + '">' + statusLabel[o.status] + '</span>' +
      '</div>' +
    '</div>';

  appEl.innerHTML =
  '<section class="view">' +
    '<div class="m-head">' +
      '<div>' +
        '<h2>Dashboard ' + esc(BOOTH.name) + '</h2>' +
        '<p class="sub2">Perubahan langsung terlihat di semua device pembeli yang terhubung.</p>' +
      '</div>' +
      '<div class="m-actions">' +
        '<button class="btn btn-ghost btn-sm" id="btnQRFull" type="button">QR Standee &#x2B0C;</button>' +
        '<button class="sound-btn ' + (BazarQAudio.enabled ? 'on' : '') + '" id="btnMSound" type="button">' + (BazarQAudio.enabled ? '🔊' : '🔇') + ' Suara</button>' +
        '<button class="switch ' + (S.kitchenFull ? 'on' : '') + '" id="btnKitchen" type="button" aria-pressed="' + S.kitchenFull + '">' +
          '<span class="track" aria-hidden="true"></span><span>Dapur Penuh</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    (S.kitchenFull
      ? '<div class="warn big"><b>Dapur Penuh aktif.</b> Pesanan baru ditahan dan estimasi waktu dikali dua. Matikan saat dapur lega.</div>'
      : '') +
    '<div class="stat-chips">' +
      '<div class="stat"><span class="v">' + S.orders.length  + '</span><span class="l">masuk hari ini</span></div>' +
      '<div class="stat"><span class="v">' + activeCount()    + '</span><span class="l">antrean aktif</span></div>' +
      '<div class="stat"><span class="v">' + done.length      + '</span><span class="l">selesai</span></div>' +
      '<div class="stat"><span class="v">' + rp(revenue())    + '</span><span class="l">omzet (bayar di booth)</span></div>' +
      '<div class="stat"><span class="v">' + (avg == null ? '\u00B7\u00B7\u00B7' : avg + ' mnt') + '</span><span class="l">rata-rata/pesanan</span></div>' +
    '</div>' +
    '<div class="board">' +
      '<div class="col"><h3>Menunggu <span class="count">' + wait.length + '</span></h3>' +
        (wait.length ? wait.map(oc).join('') : '<div class="empty">Antrean kosong. Tunjukkan QR standee ke pengunjung.</div>') + '</div>' +
      '<div class="col"><h3>Diproses <span class="count">' + proc.length + '</span></h3>' +
        (proc.length ? proc.map(oc).join('') : '<div class="empty">Belum ada yang diproses. Tekan Proses pada antrean yang menunggu.</div>') + '</div>' +
      '<div class="col"><h3>Siap Diambil <span class="count">' + ready.length + '</span></h3>' +
        (ready.length ? ready.map(oc).join('') : '<div class="empty">Belum ada pesanan siap.</div>') + '</div>' +
      '<div class="col">' +
        '<h3>Aktivitas <span class="count">' + S.log.length + '</span></h3>' +
        '<div class="panel feed">' + (S.log.slice(0,7).map(l =>
          '<div class="feed-line"><span class="mono">' + hhmm(l.at) + '</span><span>' + esc(l.text) + '</span></div>').join('') || '<div class="empty">Belum ada aktivitas.</div>') + '</div>' +
        '<h3 class="mt">Selesai hari ini <span class="count">' + done.length + '</span></h3>' +
        '<div class="panel feed">' + (done.slice(0,6).map(o =>
          '<div class="feed-line"><span class="mono">' + esc(o.ticket) + '</span><span>' + rp(o.total) + ' &middot; ' + hhmm(o.completedAt) + '</span></div>').join('') || '<div class="empty">Belum ada yang selesai.</div>') + '</div>' +
      '</div>' +
    '</div>' +
  '</section>';

  $('#btnKitchen').addEventListener('click', () => {
    toggleKitchen(); renderAll();
    toast(S.kitchenFull ? 'Dapur Penuh aktif. Pembeli baru melihat peringatan.' : 'Dapur Penuh dimatikan. Pesanan baru diterima lagi.');
  });
  $('#btnQRFull').addEventListener('click', showQRFullscreen);
  $('#btnMSound').addEventListener('click', () => {
    BazarQAudio.toggle();
    const btn = $('#btnMSound');
    btn.className = 'sound-btn' + (BazarQAudio.enabled ? ' on' : '');
    btn.textContent = (BazarQAudio.enabled ? '🔊' : '🔇') + ' Suara';
  });
  $$('[data-set]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.set.split(':');
    setStatus(Number(p[0]), p[1]);
    renderAll();
  }));
}

function renderPinLogin(){
  appEl.innerHTML =
  '<section class="view buyer-wrap">' +
    '<div class="panel">' +
      '<h2 class="menu-title">Masuk dashboard merchant</h2>' +
      '<p class="tiny" style="margin:0 0 16px">Login sederhana pakai PIN booth &mdash; tanpa email, tanpa kata sandi panjang. Bisa dipakai dalam 5 menit tanpa pelatihan.</p>' +
      '<div class="field" style="margin-top:0">' +
        '<label for="pin">PIN booth</label>' +
        '<input class="input pin" id="pin" inputmode="numeric" maxlength="4" placeholder="\u2022\u2022\u2022\u2022" autocomplete="off">' +
        '<div class="field-err" id="pinErr" hidden>PIN salah. Coba lagi.</div>' +
      '</div>' +
      '<button class="btn btn-primary wide" id="btnPin" type="button">Masuk</button>' +
      '<p class="tiny center" style="margin-top:10px">PIN demo: <b>1234</b></p>' +
    '</div>' +
  '</section>';

  const go = () => {
    if ($('#pin').value === PIN){ sessionStorage.setItem(K_AUTH,'1'); renderAll(); }
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
  const tenants = [{ name:BOOTH.name + ' (demo langsung)', n:S.orders.length }].concat(contoh);
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
      '<p class="sub2">Agregat antrean lintas tenant untuk evaluasi event. Di produksi, data terkumpul lewat backend sesuai PRD bagian 6.</p>' +
    '</div></div>' +
    '<div class="stat-chips">' +
      '<div class="stat"><span class="v">' + total + '</span><span class="l">total antrean event</span></div>' +
      '<div class="stat"><span class="v">' + activeCount() + '</span><span class="l">antrean berjalan</span></div>' +
      '<div class="stat"><span class="v">' + pad2(busiest[0]) + ':00</span><span class="l">jam tersibuk</span></div>' +
      '<div class="stat"><span class="v">' + kitchenEvents + '\u00D7</span><span class="l">dapur penuh menyala</span></div>' +
    '</div>' +
    '<div class="grid2">' +
      '<div class="panel"><h3>Volume antrean per tenant</h3>' +
        tenants.map(t =>
          '<div class="bar-row"><span class="tn">' + esc(t.name) + '</span>' +
          '<span class="bar-track"><span class="bar' + (t.n === S.orders.length ? '' : ' dim') + '" style="width:' + Math.max(4, Math.round(t.n / maxT * 100)) + '%"></span></span>' +
          '<span class="v">' + t.n + '</span></div>').join('') +
        '<p class="tiny">Tenant tanpa tanda adalah booth yang berjalan dari demo langsung di stand ini.</p>' +
      '</div>' +
      '<div class="panel"><h3>Antrean per jam</h3>' +
        '<div class="hours">' + hours.map(x =>
          '<div class="hb' + (x[0] === busiest[0] ? ' max' : '') + '"><span class="n">' + x[1] + '</span>' +
          '<span class="b" style="height:' + Math.max(4, Math.round(x[1] / maxH * 100)) + '%"></span>' +
          '<span class="h">' + pad2(x[0]) + '</span></div>').join('') + '</div>' +
        '<p class="tiny">Gabungan data contoh event dan antrean demo langsung di stand.</p>' +
      '</div>' +
      '<div class="panel insight"><h3>Bacaan cepat</h3>' +
        '<ul class="tight">' +
          '<li>Jam tersibuk di sekitar <b>' + pad2(busiest[0]) + ':00</b>. Siapkan satu staf tambahan di jam tersebut.</li>' +
          '<li>' + (kitchenEvents > 0
            ? 'Dapur Penuh pernah menyala pada demo ini. Pertimbangkan jeda pembukaan antrean di event berikutnya.'
            : 'Belum ada kejadian Dapur Penuh. Coba nyalakan dari dashboard merchant lalu lihat efeknya di sini.') + '</li>' +
          '<li>Rekap per tenant membantu menilai booth paling ramai untuk kurasi event berikutnya.</li>' +
        '</ul>' +
      '</div>' +
    '</div>' +
  '</section>';
}

/* ---------- live tick ---------- */
function liveTick(){
  if (route() === 'beranda'){
    const live = activeOrders().find(o => o.status === 'processing') || activeOrders().slice(-1)[0] || null;
    const n = $('[data-live-num]'), s = $('[data-live-sub]');
    if (n) n.textContent = live ? live.ticket : 'A-\u00B7\u00B7\u00B7';
    if (s) s.textContent = live ? estLabel(live) + ' \u00B7 ' + activeCount() + ' antrean aktif' : 'Belum ada antrean aktif';
  }
  $$('[data-el]').forEach(el => {
    const o = S.orders.find(x => x.id === Number(el.dataset.el));
    if (o) el.textContent = elapsedLabel(o);
  });
}

/* ---------- init ---------- */
window.addEventListener('hashchange', () => { renderAll(); window.scrollTo(0,0); });
$('#btnReset').addEventListener('click', resetDemo);
setInterval(liveTick, 1000);
load(); // async — render setelah Firebase terhubung
