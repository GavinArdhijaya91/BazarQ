# BazarQ, Antrean Digital untuk Bazar UMKM

BazarQ memindahkan antrean bazar ke perangkat digital pengunjung. Pembeli memindai QR di booth, memilih menu, lalu menerima nomor antrean dan estimasi tunggu. Tanpa pasang aplikasi, tanpa buat akun. Pembeli bebas menjelajah, dagangan tetap terkendali.

Dibangun untuk Gelar Karya Technopreneurship Universitas Negeri Semarang.

**Demo langsung:** https://bazar-q.vercel.app

## Cara kerja

1. **Pembeli** memindai QR standee di booth → memilih menu → mengisi WhatsApp → menerima tiket (contoh: A-007) beserta estimasi tunggu.
2. **Penjual (kasir)** menekan Konfirmasi Lunas setelah pembayaran tunai/QRIS terverifikasi → pesanan diteruskan ke dapur.
3. **Penjual (dapur)** meracik, menekan Pesanan Siap → pembeli menerima bunyi + getar + pesan → menunjukkan tiket di booth → Selesai.
4. Saat membludak, penjual menyalakan **Dapur Penuh**: estimasi tiket baru otomatis +15 menit.

## Peran di dalam aplikasi

| Rute | Peran | Isi |
|---|---|---|
| `#pembeli/{kode-booth}` | Pembeli | Katalog, checkout QRIS/tunai, tiket live, simulasi notifikasi WhatsApp |
| `#merchant/{kode-booth}` | Penjual | Kasir, dapur, layar publik, QR standee, walk-in, menu habis, QRIS toko |
| `#merchant/{kode}/display` | Layar publik | Tampilan TV/proyektor, read-only, tanpa tombol |
| `#eo` | Penyelenggara | Ringkasan antrean semua booth + jam tersibuk |
| `#daftar` | Pendaftaran | Booth baru dalam semenit + QR order siap cetak |

Masuk dasbor penjual cukup dengan PIN booth 4 sampai 6 digit.

## Prinsip produk (dari PRD)

- **Ringan:** halaman pemesanan di bawah 100 KB, tetap lancar saat jaringan bazar padat.
- **Nol aplikasi:** berjalan di browser perangkat digital biasa.
- **Satu layar satu keputusan:** kasir cukup menandai lunas atau belum, dapur cukup memasak atau memanggil.
- **Realtime:** semua perangkat di booth yang sama tersinkron otomatis lewat Firebase.

## Teknologi prototipe

- Frontend: HTML + CSS + JavaScript murni (tanpa build, tanpa framework).
- Backend: serverless memakai Firebase Realtime Database, tiap booth punya ruang datanya sendiri.
- Suara: Web Audio API (sintesis, tanpa file mp3).
- Deploy: Vercel (`vercel.json` mengarah ke `prototype/`).

## Struktur repo

```
prototype/        → aplikasi web (index, css, js, favicon)
  assets/         → logo & favicon transparan
backend/          → rules Firebase, tool CLI buat booth, panduan deploy
docs/             → dokumen internal (di-ignore, tidak ikut publik)
media/            → materi internal (di-ignore, tidak ikut publik)
```

## Menjalankan lokal

Cukup buka `prototype/index.html` di browser, atau sajikan folder repo dengan server statis apa pun. Tidak perlu install, tidak perlu build.

## Peta jalan

- [x] MVP: 3 peran, QRIS statis + tunai, Dapur Penuh, notifikasi suara + pesan
- [ ] QRIS dinamis / payment gateway otomatis
- [ ] Analitik penyelenggara level lanjut
- [ ] Prediksi dapur & harga dinamis
