# 🎨 BazarQ Frontend Development Skill & System Rules

Dokumen ini adalah acuan standar (System Instructions / AI Skill Document) untuk merancang dan membangun seluruh antarmuka pengguna (Frontend UI/UX) dari sistem **BazarQ (Event-Driven Micro-Queue & Order Manager)**.

---

## 1. Core Philosophy & Design Strategy

* **Zero-App Customer Experience**: Pembeli **tidak boleh** diminta *download* aplikasi atau *register* akun/password. Cukup scan QR $\rightarrow$ Lihat Menu $\rightarrow$ Pesan $\rightarrow$ Dapatkan Tiket Digital.
* **Ultra-Lightweight & Offline-Friendly**: Beban aset awal di bawah **100 KB**. Didesain performant untuk kondisi jaringan seluler terenkode/padat di arena bazar/event.
* **SaaS Modern & Clean Aesthetic**: Tampilan profesional, segar, dan *user-friendly* berbasis warna biru sesuai poster resmi BazarQ.
* **Mobile-First Orientation**: Pembeli menggunakan smartphone, Merchant (penjual) mengoperasikan dari smartphone/tablet di booth.

---

## 2. Color Palette & Typography System (Tailwind CSS Ready)

Warna diambil dan disempurnakan dari poster resmi **BazarQ**:

### Primary Palette (BazarQ Blue Spectrum)
* `brand-navy`: `#0F172A` (Text utama, header dark)
* `brand-deep`: `#1E40AF` (Primary Button, Active Header, Accent)
* `brand-azure`: `#2563EB` (Primary Brand Color, Highlights)
* `brand-sky`: `#60A5FA` (Border active, Secondary icons, Status info)
* `brand-ice`: `#EFF6FF` (Card background, Active badge, Soft highlight)

### Functional / Status Palette
* **Pending / In Queue**: Amber Gold (`#F59E0B` / `#FEF3C7`)
* **Processing / Dapur**: Electric Blue (`#3B82F6` / `#DBEAFE`)
* **Ready / Siap Diambil**: Success Green (`#10B981` / `#D1FAE5`)
* **Completed / Selesai**: Neutral Slate (`#64748B` / `#F1F5F9`)
* **Smart Throttling (Dapur Penuh)**: Warning Orange/Rose (`#E11D48` / `#FFE4E6`)

### Typography
* **Font Family**: Inter, Plus Jakarta Sans, atau system sans-serif font.
* **Style**: Clean, bold headings untuk nomor antrean, contrast tinggi agar mudah dibaca di bawah sinar matahari/outdoor bazar.

---

## 3. Audio & Notification System (Custom Ringtone Spec)

Sistem wajib menyediakan **Web Audio API Sound Engine** (tanpa perlu *download library* berat) untuk efek suara interaktif:

1. **Merchant Sound (Pesanan Masuk Baru)**:
   * Chime double-beep bernada tinggi (*Pleasant Notification Bell*).
   * Otomatis memicu pemutaran suara saat WebSocket / Polling mendeteksi `status: waiting` baru.
   * Dilengkapi Toggle Switch & Volume Slider di header Dashboard Merchant ("🔊 Suara Notifikasi Active").
2. **Customer Sound (Pesanan Siap Diambil)**:
   * Chime sukses bernada ceria 3-tone (*Order Ready Ringtone*).
   * Berbunyi ketika status tiket berubah dari `processing` $\rightarrow$ `ready`.
   * PWA Notification Web Push & Tombol Izinkan Notifikasi bawaan di halaman tiket.

---

## 4. Structure & Role View Separation

Aplikasi dibagi menjadi **3 Modul Antarmuka Terpisah**:

```
BazarQ Web Ecosystem
├── 📱 Customer View  (/order/{booth_slug} & /ticket/{ticket_id})
├── 🏪 Merchant View  (/merchant/dashboard & /merchant/qr-display)
└── 📊 EO Dashboard   (/eo/analytics - B2B Extension Placeholder)
```

---

## 5. View Specifications

### 📱 A. Customer View (Zero-App Portal)

#### 1. Menu & Ordering Page (`/order/{booth_slug}`)
* **Header**: Banner mini booth, nama toko, logo BazarQ, status booth ("Buka" / "Dapur Penuh").
* **Warning Banner (Jika Dapur Penuh)**: Banner transparan warna Rose/Orange: *"⚠️ Dapur sedang penuh. Estimasi waktu nunggu mungkin lebih lama (+15 menit)."*
* **Menu Grid/List**:
  * Item image (lazy-loaded, kompresi tinggi).
  * Nama menu, harga, deskripsi singkat, tombol `+ Tambah`.
* **Sticky Bottom Drawer / Cart Bar**:
  * Menampilkan total item & harga.
  * Form input cepat: **Nama Pembeli** & **Nomor WhatsApp** (untuk bot alert).
  * Tombol CTA mencolok: `Kirim Pesanan (Dapat Tiket)` warna `brand-azure`.

#### 2. Live Digital Ticket Page (`/ticket/{ticket_id}`)
* **Main Card**:
  * Nomor Antrean Besar (Contoh: **A032**).
  * Status Live Badge: `Menunggu` / `Diproses` / `Siap Diambil!` / `Selesai`.
  * Estimasi Waktu Tunggu Real-Time (Contoh: `± 8 Menit`).
  * Live Progress Bar (Langkah 1: Diterima $\rightarrow$ Langkah 2: Dimasak $\rightarrow$ Langkah 3: Siap).
* **Action Buttons**:
  * `🔊 Aktifkan Suara Panggilan` (Toggle audio web).
  * `📲 Notifikasi WhatsApp Aktif` (Indikator status WA).
* **Accordion Detail Pesanan**: Ringkasan item pesanan & total bayar (pembayaran tetap cash/QRIS langsung di booth).

---

### 🏪 B. Merchant Dashboard View (`/merchant/dashboard`)

#### 1. Quick Control Header Bar
* Status Booth Switch: `Buka Normal` vs `🔥 Dapur Penuh (Smart Throttling)`.
* Quick Action Display QR: Button untuk membuka tampilan layar/pop-up QR Code Booth.
* Audio Notification Control: Status bel suara + Tombol Test Sound.

#### 2. Kanban / List Pesanan Real-Time
Kolom / Tab yang disusun intuitif untuk HP merchant:
* **Antrean Masuk (Waiting)**:
  * Card menampilkan Nomor Tiket, Nama Pembeli, Ringkasan Item, Waktu Order.
  * Tombol Aksi Utama: `[ 👨‍🍳 Proses Pesanan ]`
* **Sedang Diproses (Processing)**:
  * Menampilkan timer berjalan sejak diproses.
  * Tombol Aksi Utama: `[ 🔔 Panggil / Pesanan Siap! ]` $\rightarrow$ *Memicu Notifikasi WA & PWA ke Pembeli*.
* **Siap Diambil (Ready)**:
  * Highlight hijau.
  * Tombol Aksi Utama: `[ ✅ Selesai / Diserahkan ]`.

#### 3. Rekap Singkat Harian (Sales Drawer)
* Total Tiket Hari Ini.
* Omset Kotor Terhitung.
* Top 3 Menu Terlaris.

---

### 📊 C. EO Enterprise Dashboard (B2B Expansion - Architecture Ready)

* **Status**: Modular component / Layout terpisah.
* **Visual**: Clean Slate & Sapphire Blue Theme.
* **Fitur (Read-Only Placeholder)**:
  * Agregat Total Pengunjung / Antrean seluruh tenant.
  * Grafis Jam Sibuk Bazar (Peak Hours Heatmap).
  * Tabel Performa Tenant (Tenant A, Tenant B, dll).

---

## 6. Frontend Coding Standards & Constraints

When generating frontend components or pages for BazarQ:

1. **Responsive First**: Design strictly for mobile screens first ($360\text{px} - 430\text{px}$ width) for Customer & Merchant UI, while ensuring scaling up gracefully to Tablet/Desktop.
2. **No Heavy Framework Overhead**: If writing HTML/Blade/Alpine.js, avoid heavy external JS libraries. Use native CSS / Tailwind classes.
3. **Accessibility & Outdoor Visibility**: Text contrast must be minimum WCAG AA. High contrast buttons for bright sunlight environments.
4. **State Management & Audio Initialization**: Always handle web audio user gesture restrictions (enable sound context on first user click).

---

## 7. Sample Interactive Code Snippet (Web Audio Alert Engine)

Gunakan pola JavaScript berikut untuk penanganan suara khusus di frontend:

```javascript
// BazarQ Sound Engine
const BazarQAudio = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  playOrderReady() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    // Arpeggio C Major (C5 -> E5 -> G5)
    osc.frequency.setValueAtTime(523.25, now); 
    osc.frequency.setValueAtTime(659.25, now + 0.1); 
    osc.frequency.setValueAtTime(783.99, now + 0.2); 
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
  }
};