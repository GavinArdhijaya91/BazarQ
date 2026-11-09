# Backend Serverless BazarQ

Penyimpanan state terdesentralisasi menggunakan Firebase Realtime Database. Setiap booth beroperasi di dalam namespace terisolasi yang diidentifikasi oleh string `slug` unik dari routing URL.

## Hirarki Basis Data

```
bazarq/
└── v2/
    ├── registry/
    │   └── {slug}/               → { name: string, createdAt: number }
    ├── booths/
    │   └── {slug}/               → { seq: number, kitchenFull: boolean, profile: object, menu: array, orders: array, log: array, v: number }
    └── presence/
        └── {slug}/
            └── {pushId}/         → { role: string, at: number }
```

## Aturan Keamanan & Akses Data

Aturan didefinisikan pada file `backend/database.rules.json`:

* `bazarq/v2/registry/{slug}`: Kebijakan tulis-sekali (`!data.exists() && newData.exists()`). Pendaftaran ulang atau modifikasi slug yang sudah ada ditolak oleh database.
* `bazarq/v2/booths/{slug}`: Menegakkan kewajiban adanya atribut skema (`profile`, `menu`, `seq`, `kitchenFull`).
  * `profile.pinHash`: Wajib berupa string heksadesimal lowercase SHA-256 sepanjang 64 karakter (`^[0-9a-f]{64}$`). Atribut `pin` dalam teks polos dilarang.
  * `seq`: Nilai integer antara 0 hingga 9999.
  * `orders`: Array objek pesanan yang wajib memiliki `id`, `ticket`, `status` (`waiting|processing|ready|completed`), `total`, `items`, dan `createdAt`.
* `bazarq/v2/presence/{slug}`: Node efemeral yang mendukung pembuatan push-id dan penghapusan otomatis saat perangkat terputus (`onDisconnect`).

## Petunjuk Deployment Aturan Firebase

1. Buka Firebase Console → Pilih proyek `bazarq-7adbe`.
2. Masuk ke menu **Build** → **Realtime Database** → tab **Rules**.
3. Salin seluruh isi berkas `backend/database.rules.json`, tempel ke editor rules, lalu klik **Publish**.
4. (Opsional) Pada tab **Data**, klik `⋮` → **Import JSON** → unggah `backend/seed-booths.json` untuk mengisi data contoh pada namespace `demo-geprek`.

## CLI Pendaftaran Booth

Pendaftaran namespace booth baru melalui REST API tanpa memerlukan kredensial administratif:

```bash
node backend/tools/create-booth.mjs --name "Kopi Rame" --pin 1234
```

### Parameter & Variabel Lingkungan

| Parameter | Tipe | Nilai Default | Deskripsi |
|---|---|---|---|
| `--name` | String | `"Booth Demo"` | Nama tampilan booth (3–60 karakter). |
| `--pin` | String | `"1234"` | PIN autentikasi penjual (4–6 digit angka). |
| `--desc` | String | `"Booth UMKM BazarQ"` | Deskripsi singkat booth (maksimal 80 karakter). |
| `BAZARQ_DB_URL` | Env | `https://bazarq-7adbe-default-rtdb...` | Basis URL kustom Firebase RTDB. |
| `BAZARQ_APP_URL` | Env | `https://bazar-q.vercel.app` | Basis URL web aplikasi. |

### Kontrak Output

Setelah eksekusi berhasil, terminal mencetak:
* Slug booth: `${slug}`
* URL QR Pembeli: `${BAZARQ_APP_URL}/#pembeli/${slug}`
* URL Dasbor Penjual: `${BAZARQ_APP_URL}/#merchant/${slug}`
