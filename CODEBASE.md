# Arsitektur & Kontrak Kode BazarQ

BazarQ adalah aplikasi web sistem antrean dan pemesanan digital serverless untuk stan bazar dan festival kuliner UMKM. Sistem beroperasi tanpa akun pengguna, tanpa unduhan aplikasi native, dan tanpa server backend khusus.

---

## 1. Struktur Direktori

```
.
├── backend/
│   ├── database.rules.json    # Aturan keamanan dan validasi Firebase Realtime Database
│   ├── seed-booths.json       # State awal contoh untuk namespace demo-geprek
│   ├── tools/
│   │   └── create-booth.mjs   # Skrip CLI provisioning namespace booth baru
│   └── README.md              # Spesifikasi deployment dan aturan backend
├── prototype/
│   ├── assets/                # Favicon, ikon aplikasi, dan logo
│   ├── css/
│   │   └── styles.css         # Token desain, layout responsif, komponen, dan animasi
│   ├── js/
│   │   ├── app.js             # Logika aplikasi klien, routing, audio, dan perender tampilan
│   │   └── firebase-config.js # Kredensial Firebase sisi klien dan konstanta lingkungan
│   ├── index.html             # Shell halaman tunggal dan pemuat berkas aset
│   └── README.md              # Instruksi eksekusi dan matriks verifikasi peran
├── vercel.json                # Konfigurasi rewrite Vercel yang mengarahkan trafik ke prototype/
└── README.md                  # Ikhtisar proyek dan pintu masuk publik
```

---

## 2. Kontrak Komponen

### 2.1 `prototype/index.html`
* **Fungsi**: Shell dokumen HTML5, pemuat aset eksternal, dan kontainer mount DOM.
* **Kontrak DOM**:
  * `#app`: Kontainer dinamis utama tempat rendering setiap tampilan rute.
  * `#mainNav`: Navigasi utama yang menautkan `#beranda`, `#pembeli`, `#merchant`, `#eo`, `#daftar`.
  * `#presenceBadge` / `#presenceCount`: Elemen yang dimutasi oleh pemantau presensi perangkat aktif.
  * `#toast`: Wilayah live accessibility (`aria-live="polite"`) untuk notifikasi toast singkat.
  * `#btnExit`: Tombol navigasi kembali yang hanya tampil pada sub-tampilan aplikasi.
* **Dependensi Eksternal**:
  * Google Fonts (`Bricolage Grotesque`, `DynaPuff`, `Fredoka`, `IBM Plex Mono`).
  * Pustaka Firebase 10.12.0 compat (`firebase-app-compat.js`, `firebase-database-compat.js`).
  * QRCode.js 1.0.0 (`qrcode.min.js`).

### 2.2 `prototype/js/firebase-config.js`
* **Fungsi**: Konfigurasi runtime global yang diekspor pada objek `window`.
* **Kontrak**:
  * `window.FIREBASE_CONFIG`: Objek konfigurasi klien Firebase (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
  * `window.DEMO_URL`: String hostname produksi (`bazar-q.vercel.app`) sebagai basis URL saat membuat kode QR dari IP atau jaringan lokal.
* **Jaminan**: Kredensial bersifat publik; pembatasan akses data ditegakkan sepenuhnya oleh Firebase Security Rules.

### 2.3 `prototype/js/app.js`
* **Fungsi**: Logika utama aplikasi web klien yang menangani routing, sinkronisasi state reaktif, sintesis audio, dan perender tampilan.
* **Subsistem Utama**:

#### A. Subsistem Routing
* `boothFromUrl()`: Mengekstrak slug booth dari parameter query `?booth={slug}`, hash URL (`#pembeli/{slug}`, `#merchant/{slug}`), atau `sessionStorage('bazarq.booth')`. Fallback default ke `demo-geprek`.
* `ticketIdFromUrl()`: Mengekstrak ID tiket numerik dari pola `#tiket/{slug}/{id}`.
* `adoptTicketFromUrl()`: Memulihkan stage tiket pembeli saat halaman dibuka kembali melalui URL tersimpan.
* `orderUrl(slug)` / `merchantUrl(slug)` / `ticketUrl(slug, id)`: Menghasilkan URL kanonikal publik untuk target QR code dan bookmark.

#### B. State Store & Sinkronisasi Database
* **State Dimiliki**: `S` (snapshot data booth di memori).
* `freshState(profile, menu)`: Factory yang mengembalikan struktur data default `{ v: 1, seq: 0, kitchenFull: false, orders: [], log: [], profile, menu }`.
* `sanitizeState()`: Menormalisasi tipe data, membatasi ukuran array (pesanan <= 200, log <= 40), memvalidasi hash PIN SHA-256, dan menghapus field PIN plaintext sebelum penyimpanan.
* `save()`: Operasi tulis ter-debounce (250ms) ke path `bazarq/v2/booths/{slug}`. Menambah nilai versi skema `S.v`.
* `load()`: Menjalankan pembacaan awal `stateRef.once('value')` yang dilanjutkan dengan listener WebSocket `stateRef.on('value')`. Mengisolasi error `PERMISSION_DENIED` untuk menampilkan petunjuk perbaikan rules di UI.

#### C. Engine Feedback Audio & Haptik (`BazarQAudio`)
* **State Dimiliki**: `ctx` (`AudioContext`), `enabled` (boolean), `pending` (callback tertunda).
* `init()`: Melakukan inisialisasi malas (*lazy initialization*) `AudioContext` dan melanjutkan konteks yang tersuspensi.
* `unlock()`: Membuka kunci gestur audio pertama pengguna agar sesuai dengan kebijakan autoplay browser modern.
* `_play(freqs, dur, vol)`: Mensintesis burst osilator sine dengan gain ramp linier/eksponensial. Menyimpan callback ke `this.pending` jika konteks masih tersuspensi.
* `playReadyAlert()`: Pola nada ganda 4-frekuensi (523.25Hz, 659.25Hz, 783.99Hz, 1046.5Hz) dipadukan dengan pola getar ponsel `[180, 120, 220]`.
* `playNewOrder()`: Notifikasi 2-frekuensi (880Hz, 1108.73Hz) yang dipicu saat dasbor penjual menerima kenaikan counter `seq`.

#### D. Pemantau Presensi Perangkat
* `setupPresence()`: Mendaftarkan node efemeral di `bazarq/v2/presence/{slug}/{pushId}` dengan instruksi `onDisconnect().remove()`. Mendengarkan jumlah child node aktif untuk menampilkan metrik perangkat terhubung secara live.

#### E. Perender Tampilan
* `renderLanding()`: Merender landing page premium dark-tech (terinspirasi dari AirLume.Ai & Schematics ITS) dengan latar belakang dark navy (`#060D1F`), animasi aurora mesh radial blobs, headline tipografi besar, 2 tombol aksi terarah (CTA), showcase kartu visual 3D interaktif yang merespons posisi mouse, simulator interaktif Dapur Penuh dan Chime audio Web Audio API, trust strip horizontal, bento grid fitur PRD dengan diversitas visual tematik kartu, stepper alur 5-langkah dengan nomor lencana bercahaya, dan switcher tab 4 peran pengguna berbasis mockup kaca gelap.
* `renderPembeli()`: Merender alur pembeli: pemilihan katalog menu, input nomor WhatsApp, pemantauan status tiket live, dan simulasi balon notifikasi WhatsApp.
* `renderMerchant()`: Merender konsol penjual yang dibagi ke dalam sub-rute:
  * `#merchant/{slug}/kasir`: Validasi pesanan 1-keputusan dan konfirmasi pelunasan kasir (tunai/QRIS).
  * `#merchant/{slug}/dapur`: Antrean kerja bagian dapur untuk memproses pesanan dan menandai kesiapan makanan.
  * `#merchant/{slug}/display`: Layar monitor publik TV read-only tanpa tombol aksi interaktif.
* `renderEO()`: Mengagregasi metrik total volume antrean dan estimasi jam sibuk seluruh booth.
* `renderDaftar()`: Menangani form registrasi mandiri booth baru dan merender gambar QR code asli siap cetak.

### 2.4 `prototype/css/styles.css`
* **Fungsi**: Lembar gaya tata letak responsif, token desain, dan komponen visual.
* **Arsitektur Token**:
  * Palet: 60% warna dasar kertas/es (`--paper`, `--canvas`), 30% identitas biru (`--azure`, `--navy`, `--sky`), 10% indikator status semantik (`--emerald`, `--orange`, `--danger`).
  * Ritme Spasi: Kelipatan unit dasar 8px (`--s1` hingga `--s6`).
  * Tipografi: Teks judul (`--sans`), Numerik tiket (`--ticket`), Metadata (`--mono`).
* **Lapisan Komponen Landing Page**:
  * `.hero-modern` / `.hero-modern-grid`: Tata letak hero asimetris bertema dark navy (`#060D1F`) dengan animasi aurora radial blobs (`glowBlob`), tipografi judul besar dengan teks aksen gradien listrik (`.gradient-text`), dan tombol primer berefek kilau (`.btn-glow`).
  * `.ticket-3d-wrap` / `.hero-visual-card`: Kontainer 3D interaktif yang merespons pergerakan kursor mouse dengan baris aksi simulasi langsung di kartu tiket.
  * `.floating-widget`: Komponen penunjuk status kaca gelap (*dark glassmorphism*) dengan blur 20px dan bayangan dalam.
  * `.trust-strip`: Jalur ringkasan fitur horizontal post-hero berisi pil informasi berikon SVG.
  * `.bento-grid`: Grid modular 12-kolom dengan diferensiasi atmosfer warna kartu (biru elektrik untuk pemindaian QR, oranye gelap untuk throttling, teal gelap untuk sintesis audio, dan hijau gelap untuk pembayaran ganda).
  * `.stepper-container`: Alur proses 5 langkah dengan lencana angka tebal bercahaya (`.step-num-badge`).
  * `.role-tabs-wrap`: Panel simulator 4 peran pengguna dengan mockup antarmuka bertema kaca gelap yang menjaga konsistensi tema halaman (*Page Theme Lock*).
  * `.metrics-strip`: Strip metrik operasional terintegrasi dengan 4 indikator performa sistem.

---

## 3. Kontrak Backend & Model Data

### 3.1 `backend/database.rules.json`
* **Path**: `/bazarq/v2/registry/$slug`
  * `.write`: Diizinkan hanya satu kali saat node belum ada (`!data.exists() && newData.exists()`). Modifikasi slug yang sudah terdaftar ditolak.
  * `.validate`: Wajib memiliki string `name` (3–60 karakter) dan timestamp `createdAt` (angka).
* **Path**: `/bazarq/v2/booths/$slug`
  * `.write`: Diizinkan untuk payload data yang valid.
  * `.validate`: Wajib memiliki atribut `profile`, `menu`, `seq`, dan `kitchenFull`.
  * `profile`: Wajib memuat `name` (3–60 karakter) dan `pinHash` (string lowercase heksadesimal SHA-256 sepanjang 64 karakter). Field `pin` dalam teks polos dilarang.
  * `seq`: Integer positif antara 0 hingga 9999.
  * `kitchenFull`: Boolean murni.
  * `orders/$i`: Objek pesanan wajib memiliki `id`, `ticket`, `status` (`waiting|processing|ready|completed`), `total`, `items`, dan `createdAt`.
* **Path**: `/bazarq/v2/presence/$slug/$pushId`
  * Wajib memuat string `role` dan timestamp angka `at`.

### 3.2 `backend/tools/create-booth.mjs`
* **Tipe**: Utilitas skrip CLI Node.js ES Module mandiri.
* **Input yang Diterima**:
  * `--name <string>`: Nama tampilan booth (minimal 3 karakter, wajib).
  * `--pin <digits>`: PIN integer 4–6 digit (default: `1234`).
  * `--desc <string>`: Deskripsi booth (opsional).
* **Variabel Lingkungan**:
  * `BAZARQ_DB_URL`: Endpoint Firebase RTDB REST.
  * `BAZARQ_APP_URL`: Basis URL frontend web aplikasi.
* **Efek Samping**:
  * Menjalankan request `PUT /bazarq/v2/registry/{slug}.json`.
  * Menjalankan request `PUT /bazarq/v2/booths/{slug}.json` dengan menu default dan profil terdaftar.
* **Kondisi Keluar (Exit Codes)**:
  * Kode 0: Berhasil, mencetak slug yang dibuat, URL QR pesanan pembeli, dan URL dasbor penjual.
  * Kode 1: Melempar Exception jika validasi input gagal atau request REST ditolak jaringan.

### 3.3 `backend/seed-booths.json`
* **Fungsi**: Berkas data awal untuk namespace booth contoh (`demo-geprek`).
* **Isi Kontrak**:
  * Counter sequence awal (`seq: 7`).
  * 7 data pesanan contoh yang mencakup setiap variasi status (`waiting`, `processing`, `completed`).
  * Riwayat log aktivitas mencakup pesanan masuk, status pengaktifan dapur penuh, dan pesanan selesai.

---

## 4. Infrastruktur & Deployment

### 4.1 `vercel.json`
* **Kontrak Konfigurasi**:
  ```json
  {
    "cleanUrls": true,
    "rewrites": [
      { "source": "/(.*)", "destination": "/prototype/$1" }
    ]
  }
  ```
* **Perilaku**: Menghilangkan ekstensi `.html` dari URL dan mengarahkan seluruh rute trafik server edge Vercel ke folder `/prototype/`. Berkas statis dilayani melalui jaringan CDN edge cache.

---

## 5. Batasan Keamanan & Jaminan Invarian

1. **Batas Autentikasi**:
   * Pembeli beroperasi tanpa sesi akun. Kontinuitas status tiket bergantung pada `sessionStorage` lokal dan parameter URL hash tiket.
   * Penjual diautentikasi dengan membandingkan hash SHA-256 PIN terhadap `S.profile.pinHash`. PIN teks polos tidak pernah dikirimkan atau disimpan di database.
2. **Jaminan Kondisi Bising & Offline**:
   * Notifikasi audio disintesis langsung melalui Web Audio API, menghilangkan risiko kegagalan unduhan berkas audio di area keramaian bazar dengan sinyal seluler padat.
   * Tampilan visual berupa getaran ponsel dan kedipan judul tab browser berjalan simultan saat audio berbunyi.
3. **Pengaman Lonjakan Pesanan (Smart Throttling)**:
   * Saat `kitchenFull` bernilai `true`, kalkulasi estimasi waktu tunggu otomatis digandakan (2x), dan antarmuka pembeli menampilkan peringatan penahanan order baru secara transparan.
