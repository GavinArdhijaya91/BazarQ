# 🚀 BazarQ - Minimum Viable Product (MVP) Specification

Dokumen ini merupakan spesifikasi teknis dan fungsional untuk **BazarQ Minimum Viable Product (MVP)**. Spesifikasi ini disusun berdasarkan *Outline Ide Bisnis*, *Product Requirement Document (PRD)*, serta hasil penyesuaian alur pembayaran terintegrasi untuk event temporary, bazar, dan festival kuliner.

---

## 1. Ringkasan Produk & Tujuan MVP

* **Nama Produk**: BazarQ (Event-Driven Micro-Queue & Order Manager)
* **Visi Produk**: Membantu UMKM mengelola antrean dan beban dapur saat event pop-up/bazar tanpa perangkat keras tambahan dan tanpa mengharuskan pembeli mengunduh aplikasi.
* **Target Karakteristik MVP**:
  * **Ultra-Lightweight**: Ukuran *load* awal $< 100\text{ KB}$ agar responsif di jaringan seluler padat.
  * **Zero-App Customer Portal**: Pembeli cukup *scan* QR $\rightarrow$ Pesan $\rightarrow$ Terima Tiket Digital.
  * **Zero-Learning Curve**: Merchant dapat mengoperasikan dasbor dalam waktu $< 5\text{ menit}$.
  * **Model Monetisasi**: *Pay-Per-Event Pass* (Rp25.000 – Rp40.000 / event).

---

## 2. Batasan Ruang Lingkup (Scope Management)

### 🟢 In-Scope (Fokus Utama MVP)
1. **3 Core Views Frontend**:
   * *Customer View* (Katalog Menu, Checkout, Tiket Digital Live).
   * *Cashier View* (Verifikasi Pembayaran QRIS/Cash & Input Manual).
   * *Kitchen View / Merchant Dashboard* (Manajemen Status Pesanan, *Smart Throttling*, Alert Suara).
2. **Sistem Pembayaran Opsi 1 (Static QRIS & Tunai)**: Upload gambar QRIS toko + verifikasi manual 1-klik oleh kasir.
3. **Smart Throttling Mode ("Dapur Penuh")**: Toggle manual untuk menambah estimasi waktu tunggu atau membatasi pesanan baru.
4. **Sistem Notifikasi Dual-Channel**:
   * *Web Audio API Alert* (Panggilan suara dari browser).
   * *WhatsApp Gateway Alert* (Notifikasi otomatis saat sisa 2 antrean dan saat pesanan siap).

### 🔴 Out-of-Scope (Disimpan untuk Skala Lanjut / SaaS Pro)
1. Integration *Payment Gateway* Otomatis (Dynamic QRIS / Midtrans / Xendit).
2. *EO Enterprise Analytics Dashboard* (Fitur agregat B2B untuk penyelenggara event).
3. AI Predictive Kitchen & Dynamic Pricing.

---

## 3. Spesifikasi 3 Core Views Frontend

```
BazarQ MVP Core Architecture
 ├── 📱 View A: Customer View (/order/{booth_slug} & /ticket/{ticket_id})
 ├── 💵 View B: Cashier View (/merchant/cashier)
 └── 🍳 View C: Kitchen View / Merchant Dashboard (/merchant/kitchen)
```

### 📱 View A: Customer View (Zero-App Web Portal)
* **Tujuan**: Memudahkan pembeli melakukan pemesanan tanpa aplikasi dan memantau status pesanan dari jarak jauh.
* **Komponen Utama**:
  1. **Header & Status Booth**: Menampilkan logo UMKM, nama booth, dan *banner* kondisi (*Buka Normal* / *⚠️ Dapur Penuh*).
  2. **Katalog Menu Visual**: Item menu dengan foto terkompresi, deskripsi, harga, dan tombol `+ Tambah`.
  3. **Drawer Checkout & Pembayaran**:
     * Input Nama Pembeli & Nomor WhatsApp.
     * Pilihan Metode Pembayaran:
       * 📲 **QRIS / E-Wallet** (Menampilkan gambar QRIS statis toko + total nominal).
       * 💵 **Bayar Tunai di Kasir** (Instruksi bayar langsung ke booth).
     * Tombol CTA: `Kirim Pesanan & Dapatkan Tiket`.
  4. **Digital Ticket Page (`/ticket/{id}`)**:
     * Nomor Antrean Besar (Contoh: **A032**).
     * Status Live Badge: `Menunggu Pembayaran` $\rightarrow$ `Diproses Dapur` $\rightarrow$ `Siap Diambil` $\rightarrow$ `Selesai`.
     * Estimasi Waktu Tunggu Real-Time (Contoh: $\pm 8\text{ Menit}$).
     * Toggle *Sound Alert* panggil antrean.

---

### 💵 View B: Cashier View (Verifikasi & Manajemen Akses Depan)
* **Tujuan**: Menyaring pesanan fiktif, mengonfirmasi pembayaran, dan melayani pembeli konvensional (*walk-in*).
* **Komponen Utama**:
  1. **Daftar Pesanan Menunggu Pembayaran**:
     * Kartu pesanan masuk dengan status *Belum Bayar*.
     * Rincian metode yang dipilih pembeli (QRIS / Cash).
     * Tombol Utama: `[ ✅ Konfirmasi Lunas ]` $\rightarrow$ Meneruskan pesanan langsung ke *Kitchen View*.
  2. **Walk-in Manual Order Form**: Modal/Form cepat untuk mencatat pesanan pembeli yang tidak menggunakan smartphone.
  3. **Toggle Quick "Menu Habis"**: Tombol sekali *tap* untuk menonaktifkan menu yang stoknya telah habis agar tidak muncul di *Customer View*.

---

### 🍳 View C: Kitchen View / Merchant Dashboard (Sisi Produksi Dapur)
* **Tujuan**: Membantu staf dapur fokus meracik makanan tanpa kebingungan urutan antrean.
* **Komponen Utama**:
  1. **Kanban Board Pesanan Lunas**:
     * **Kolom 1: Diproses (Processing)**: Menampilkan timer berjalan sejak pesanan dikonfirmasi lunas oleh kasir. Tombol aksi: `[ 🔔 Pesanan Siap / Panggil ]`.
     * **Kolom 2: Siap Diambil (Ready)**: Highlight warna hijau sukses. Tombol aksi: `[ ✅ Diserahkan / Selesai ]`.
  2. **Control Header Bar**:
     * Toggle **🔥 Dapur Penuh (Smart Throttling)**: Otomatis menambah estimasi $+15\text{ menit}$ pada tiket pembeli baru.
     * Toggle **🔊 Web Audio Bell**: Mengaktifkan efek suara *ding-dong* instan tiap kali kasir mengonfirmasi pesanan lunas baru.
  3. **Rekap Sales Ringkas**: Informasi total tiket diproses dan estimasi omset harian.

---

## 4. Alur Kerja Pembayaran (Option 1: Static QRIS & Cash)

```text
[PEMBELI]                                 [KASIR]                                  [DAPUR]
   │                                         │                                        │
   ├── 1. Scan QR & Pilih Menu               │                                        │
   ├── 2. Pilih QRIS / Cash & Submit         │                                        │
   │                                         │                                        │
   │ (Tiket: "Menunggu Pembayaran")          │                                        │
   └────────────────────────────────────────>│                                        │
                                             ├── 3. Cek Uang/Bukti                    │
                                             ├── 4. Klik "Konfirmasi Lunas"           │
                                             │                                        │
   ┌─────────────────────────────────────────┴───────────────────────────────────────>│
   │ (Tiket Status: "Diproses Dapur")                                                 ├── 5. Racik Makanan
   │                                                                                  ├── 6. Klik "Pesanan Siap!"
   │<─────────────────────────────────────────────────────────────────────────────────┤
   │ (Pemicu WA Alert + Sound Ready)                                                  │
   │                                                                                  │
   ├── 7. Ambil Pesanan di Booth ────────────>│                                        │
                                             └── 8. Klik "Selesai" ──────────────────>│ (Tiket Selesai)
```

---

## 5. Tumpukan Teknologi Prototype (Tech Stack)

| Layer | Teknologi MVP | Justifikasi |
| :--- | :--- | :--- |
| **Frontend** | HTML5, Tailwind CSS, Alpine.js | Ekstra ringan ($<100\text{ KB}$), ramah koneksi buruk, tanpa *overhead* framework berat. |
| **Backend** | PHP Laravel 11 / Node.js Express | Cepat dalam pembuatan REST API / Routing & manajemen state. |
| **Database** | SQLite / PostgreSQL | Cukup untuk menangani transaksi per *booth* saat event. |
| **Audio Engine** | Web Audio API (Native JS) | Memutar suara sintesis *chime* panggil antrean tanpa unduh file `.mp3` eksternal. |
| **WhatsApp Bot** | Fonnte / Wablas API Gateway | Mengirim notifikasi teks otomatis ke WhatsApp pembeli saat status pesanan diperbarui. |

---

## 6. Metrik Keberhasilan MVP (KPI)

1. **Kecepatan Onboarding Merchant**: Penjual dapat mengonfigurasi menu & QRIS dalam waktu $< 5\text{ menit}$.
2. **Nol Pesanan Tertukar**: Eliminasi $100\%$ kasus kesalahan urutan panggilan antrean di lokasi bazar.
3. **Performa Akses**: Halaman pemesanan *Customer View* berhasil dimuat dalam waktu $< 2\text{ detik}$ di jaringan 3G/4G padat.
4. **Validasi Model Bisnis**: Minimal $80\%$ *merchant* peserta uji coba bersedia membayar *Pay-Per-Event Pass* pada event berikutnya.