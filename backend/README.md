# BazarQ Backend Terdesentralisasi (Serverless · Firebase RTDB)

Tidak ada server untuk di-hosting. Setiap booth UMKM adalah **namespace data sendiri**
di Firebase Realtime Database, dan web prototype di `bazar-q.vercel.app` membaca booth
berdasarkan **slug di URL/QR**. Siapa pun bisa daftar booth sendiri lalu cetak QR.

## Arsitektur

```
bazarq/v2/registry/{slug}          → { name, createdAt }          (daftar booth publik)
bazarq/v2/booths/{slug}/profile    → { name, desc, pinHash, qrisImageUrl, createdAt }
bazarq/v2/booths/{slug}/menu       → [ { id, name, desc, price, active } ]
bazarq/v2/booths/{slug}            → { seq, kitchenFull, orders[], log[] }
bazarq/v2/presence/{slug}/{pushId} → { role, at }                 (hitung device per booth)
bazarq/state                       → (legacy booth demo tunggal, tetap didukung)
```

* **Terdesentralisasi:** tidak ada tabel pusat yang wajib dilewati — tiap booth sinkron
  langsung device ↔ Firebase via WebSocket RTDB. Server tidak menyimpan state.
* **Isolasi:** `backend/database.rules.json` — slug registry hanya bisa dibuat sekali
  (`!data.exists()`), tiap booth hanya memvalidasi strukturnya sendiri.

## Cara orang lain menjalankan (tanpa install)

1. Buka `https://bazar-q.vercel.app/#daftar`
2. Isi nama booth + PIN → klik **Buat Booth & Tampilkan QR**
3. QR yang muncul **sudah QR asli** menuju `https://bazar-q.vercel.app/#pembeli/{slug}`
   — cetak / tampilkan fullscreen di tablet, pembeli scan pakai kamera digital.
4. Buka `#merchant/{slug}` di HP penjual (login PIN), `#eo` untuk pantau event.

## Cara via terminal (opsional)

```bash
node backend/tools/create-booth.mjs --name "Kopi Rame" --pin 1234
# output: slug + link order QR + link merchant
```

Env opsional: `BAZARQ_DB_URL`, `BAZARQ_APP_URL`.

## Deploy rules & seed

1. Firebase Console → Realtime Database → Rules → paste `backend/database.rules.json` → Publish.
2. (Opsional) Import `backend/seed-booths.json` untuk booth `demo-geprek`.
3. Deploy frontend seperti biasa ke Vercel (`vercel.json` sudah mengarah ke `prototype/`).

## Format QR

Isi QR = URL penuh, contoh:

```
https://bazar-q.vercel.app/#pembeli/kopi-rame-m3k9x1
https://bazar-q.vercel.app/#order/kopi-rame-m3k9x1      (alias)
https://bazar-q.vercel.app/#merchant/kopi-rame-m3k9x1  (khusus penjual, jangan dicetak)
```

Frontend juga menerima `?booth={slug}` sebagai fallback: `/#pembeli?booth={slug}`.

## Sesuai PRD

* Zero-App: scan → pesan → tiket, tanpa akun pembeli.
* Static QRIS & Cash (Opsi 1): `profile.qrisImageUrl` + catatan "bayar di booth".
* Smart Throttling: `kitchenFull` menggandakan estimasi & menahan order baru.
* Notifikasi: Web Audio di-page + slot WA gateway (Fonnte) — payload `phone` sudah tersimpan per order.
