# BazarQ · Prototipe Demo Gelar Karya

Fondasi web prototipe untuk demo di stand: antrean digital UMKM sesuai **PRD BazarQ v1.0**. Tanpa server, tanpa build, tanpa internet. Cukup buka satu file.

## Menjalankan

1. Buka `prototype/index.html` di browser (Chrome/Edge disarankan). Selesai.
2. Untuk demo penuh, buka `index.html` di **dua tab** dan tampilkan berdampingan:
   - Windows: klik tab lalu tekan `Win + ←` dan `Win + →`.
   - Tab 1: peran **Pembeli** (`#pembeli`), Tab 2: peran **Merchant** (`#merchant`, PIN `1234`).
3. Semua perubahan tersinkron otomatis antar tab (localStorage + BroadcastChannel + polling). Bisa juga 3 tab sekaligus dengan **Event Organizer** (`#eo`).
4. Tekan **Reset demo** di kanan atas sebelum pengunjung berikutnya.

## Alur demo (2 menit)

| # | Tab Pembeli | Tab Merchant |
|---|---|---|
| 1 | Scan QR (tombol simulasi) → pilih menu → isi nomor WA → **Ambil nomor antrean** | Antrean baru langsung muncul di kolom Menunggu |
| 2 | Tiket `A-00x` + estimasi waktu tampil | Tekan **Proses** → status pembeli ikut berubah |
| 3 | Notifikasi WA tersimulasi saat tinggal 2 nomor | Aktivitas tercatat di kolom aktivitas |
| 4 | Notifikasi "pesanan siap" | Tekan **Selesai (siap)** |
| 5 | Pesanan selesai | Tekan **Sudah diambil**, rekap & omzet bertambah |
| 6 | Coba buka form baru → terblokir dengan peringatan | Nyalakan toggle **Dapur Penuh** (estimasi ×2) |
| 7 | | Buka tab **Event Organizer**: volume per tenant, jam sibuk, kejadian Dapur Penuh |

## Kesesuaian dengan PRD

| PRD | Di prototipe |
|---|---|
| UC-01 / US-01 · zero-app, tanpa registrasi | Halaman pesanan terbuka langsung, tanpa akun |
| US-02 · nomor + estimasi otomatis, diperbarui saat antrean berubah | Estimasi = posisi antrean × 4 menit, sinkron antar tab |
| US-03 · notifikasi WA di 2 momen, tidak berulang | Bubble WA tersimulasi, sekali per kondisi (produksi: gateway Fonnte) |
| US-04 · merchant ubah status dari ponselnya | Dashboard satu tombol: Proses → Selesai → Diambil |
| US-05 · toggle Dapur Penuh | Blokir pesanan baru + peringatan + estimasi ×2 |
| US-06 / UC-05 · dasbor EO | Agregat lintas tenant, jam sibuk, kejadian dapur penuh |
| Non-fungsional · < 100 KB | Seluruh demo ±50 KB (HTML + CSS + JS, tanpa framework) |
| Non-fungsional · tanpa pelatihan | PIN demo `1234`, tombol berlabel jelas |
| WON'T HAVE · payment | Pesanan dibayar di booth, sistem hanya antrean |

## Batas demo (disengaja)

- Sinkronisasi lintas-tab berlaku di satu browser/laptop yang sama. Demo lintas perangkat (HP sungguhan scan QR) butuh backend sesuai PRD bagian 6: Express/Laravel + SQLite + Cloudflare Tunnel; struktur state di `js/app.js` sudah meniru skema data PRD (booth, menu_item, queue, settings) supaya mudah dipindah.
- Notifikasi WhatsApp disimulasikan sebagai bubble; tidak mengirim pesan sungguhan.
- QR pada halaman pembeli adalah pola visual standee, bukan kode yang bisa discan.
- Data EO selain booth demo adalah contoh statis untuk menggambarkan agregasi multi-tenant.

## Struktur

```
prototype/
  index.html      # kerangka + header/footer
  css/styles.css  # token desain + semua komponen
  js/app.js       # state bersama, sinkron antar tab, 4 tampilan
```
