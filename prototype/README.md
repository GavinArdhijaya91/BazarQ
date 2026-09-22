# BazarQ · Prototipe Demo Gelar Karya

Fondasi web prototipe untuk demo di stand: antrean digital UMKM sesuai **PRD BazarQ v1.0**. Tanpa server, tanpa build, tanpa internet. Cukup buka satu file.

## Menjalankan & Demo 4 Device (Gelar Karya)

Aplikasi telah terhubung ke **Firebase Realtime Database** sehingga sinkron secara nyata antar perangkat secara instan tanpa perlu berada di satu browser yang sama!

### Skenario Demo 4 Device:
1. **Device 1 (Laptop/Tablet / HP Penjual)**:
   - Buka `https://<domain-vercel-kamu>.vercel.app/#merchant`
   - Masukkan PIN: `1234`
   - Buka QR Code Standee via tombol **"Lihat QR Standee"** agar bisa langsung di-scan kamera HP pengunjung/pembeli.
2. **Device 2 (HP Pembeli 1)**:
   - Scan QR Code atau buka `https://<domain-vercel-kamu>.vercel.app/#pembeli`
   - Pilih menu, isi no WA (misal `081234567891`), klik **Ambil Nomor Antrean** -> Mendapat nomor `A-001`.
3. **Device 3 (HP Pembeli 2)**:
   - Buka `#pembeli` -> Ambil nomor antrean -> Mendapat nomor `A-002`.
4. **Device 4 (HP Pembeli 3)**:
   - Buka `#pembeli` -> Ambil nomor antrean -> Mendapat nomor `A-003`.

### Aksi Real-time yang Terjadi Sesuai PRD:
- **Di Device Penjual**: Muncul suara chime notifikasi pesanan masuk! Ketiga antrean langsung muncul di kolom **"Menunggu"**.
- **Di Device Pembeli 2 & 3**: Tampil estimasi waktu dan sisa antrean di depan mereka secara live.
- **Penjual klik "Mulai Proses" pada A-001**: Di HP Pembeli 1, status tiket langsung berubah real-time jadi biru ("Sedang Disiapkan").
- **Penjual klik "Selesai (Siap)" pada A-001**: Di HP Pembeli 1, berbunyi notifikasi siap + tampil banner hijau besar "Silakan Ambil Pesanan di Booth!". Di HP Pembeli 2, muncul simulasi notifikasi WhatsApp: *"Pesanan Anda segera diproses (sisa 1 antrean lagi)"*.
- **Penjual aktifkan toggle "Dapur Penuh"**: Jika pembeli baru mencoba order, sistem menahan/memperingatkan dan estimasi waktu otomatis dikalikan 2.
- **Monitoring Event Organizer**: Buka `#eo` di layar proyektor stand untuk menampilkan metrik volume UMKM, peak hour, dan status Dapur Penuh secara live.

### Catatan Simulasi:
- Notifikasi WhatsApp disimulasikan sebagai bubble; tidak mengirim pesan sungguhan.
- QR pada halaman pembeli adalah pola visual standee, bukan kode yang bisa discan.
- Data EO selain booth demo adalah contoh statis untuk menggambarkan agregasi multi-tenant.

## Struktur

```
prototype/
  index.html            # kerangka + header/footer + presence indicator
  css/styles.css        # token desain BazarQ Blue Spectrum + semua komponen
  js/
    firebase-config.js  # kredensial Firebase RTDB & demo URL
    app.js              # sinkronisasi realtime, audio synth, 4 tampilan peran
```
