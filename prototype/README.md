# Klien Prototipe BazarQ

Klien web untuk sistem manajemen antrean dan pemesanan digital BazarQ. Diimplementasikan menggunakan HTML standar, CSS, dan JavaScript murni tanpa tahapan build maupun bundler.

## Cara Menjalankan

Sajikan direktori repository menggunakan web server statis apa pun, atau buka file `prototype/index.html` langsung di browser.

Pada lingkungan produksi Vercel, semua permintaan URL diarahkan ke direktori ini melalui konfigurasi `vercel.json`.

## Matriks Verifikasi Multi-Perangkat

Pengujian fungsional memerlukan minimal satu perangkat terminal penjual dan satu perangkat pembeli yang terhubung ke namespace booth yang sama (`demo-geprek` secara default).

| Peran Perangkat | Target URL | Kontrak Interaksi & State |
|---|---|---|
| **Terminal Penjual** | `#merchant/{slug}` | Autentikasi dengan PIN (`1234`). Menampilkan pesanan masuk pada kolom `waiting`. Menyediakan tombol pengubah status ke `processing` dan `ready`. Mengontrol toggle `kitchenFull`. |
| **Perangkat Pembeli 1** | `#pembeli/{slug}` | Memilih menu, mengisi nomor telepon, dan mengirim pesanan. Menerima tiket `A-001`. Berada pada status `waiting` hingga penjual mengonfirmasi pembayaran. |
| **Perangkat Pembeli 2** | `#pembeli/{slug}` | Mengirim pesanan berikutnya. Menerima tiket `A-002`. Menampilkan posisi antrean relatif terhadap pesanan aktif di depannya. |
| **Layar Dapur** | `#merchant/{slug}/dapur` | Tampilan dapur baca/tulis tanpa kontrol pembayaran kasir. Menampilkan antrean racik pesanan aktif. |
| **Layar Publik (TV/Monitor)** | `#merchant/{slug}/display` | Layar monitor read-only tanpa tombol kontrol interaktif. Memperbarui status secara live via WebSocket. |
| **Penyelenggara Acara** | `#eo` | Mengagregasi metrik volume antrean seluruh namespace booth dalam acara. |

## Event Sinkronisasi Real-Time

* **Pembuatan Pesanan**: Pengiriman pesanan oleh pembeli menambah nilai counter `seq`, menambahkan objek pesanan ke array `S.orders`, dan menyimpannya ke `bazarq/v2/booths/{slug}`. Terminal penjual membunyikan audio `BazarQAudio.playNewOrder()`.
* **Transisi Status (`waiting` → `processing` → `ready`)**: Pembaruan status oleh penjual disimpan ke Firebase. Tampilan pembeli secara reaktif memperbarui warna badge tiket, banner informasi, dan langkah timeline.
* **Notifikasi Pesanan Siap**: Saat status pesanan berubah menjadi `ready`, perangkat pembeli memicu `BazarQAudio.playReadyAlert()` (sapuan 4-nada ganda), kedipan judul tab browser, serta pola getar ponsel (`[180, 120, 220]`).
* **Pengaman Dapur (Kitchen Throttling)**: Saat toggle `kitchenFull` bernilai `true`, estimasi waktu tunggu otomatis digandakan (2x) di seluruh tampilan pembeli.

## Struktur Direktori

```
prototype/
├── assets/          # Ikon aplikasi dan favicon
├── css/styles.css   # Token desain, layout responsif, kartu 3D, dan animasi
├── index.html       # Kerangka shell, pemuat pustaka CDN, dan kontainer mount
└── js/
    ├── app.js       # Router aplikasi, sinkronisasi state, sintesis audio, dan perender peran
    └── firebase-config.js # Konfigurasi proyek Firebase sisi klien
```
