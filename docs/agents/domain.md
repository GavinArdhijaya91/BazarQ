# Dokumen domain

Panduan bagi skill rekayasa perangkat lunak untuk menggunakan dokumentasi domain repo ini saat menjelajahi codebase.

## Sebelum menjelajah, baca

- **`GLOSSARY.md`** di root repo, atau
- **`GLOSSARY-MAP.md`** di root repo jika tersedia: berkas ini menunjuk ke satu `GLOSSARY.md` untuk setiap konteks. Baca berkas yang relevan dengan topik yang dikerjakan.
- **`docs/adr/`**: baca ADR yang berkaitan dengan area yang akan dikerjakan. Untuk repo multi-konteks, periksa juga `src/<context>/docs/adr/` untuk keputusan khusus konteks.

Jika berkas-berkas tersebut belum ada, **lanjutkan tanpa memberi catatan**. Jangan menyoroti ketiadaannya atau menyarankan untuk membuatnya sejak awal. Skill `/domain-modeling` (yang dapat dijalankan melalui `/grill-with-docs` dan `/improve-codebase-architecture`) akan membuatnya saat istilah atau keputusan domain benar-benar ditetapkan.

## Struktur berkas

Repo satu konteks (kebanyakan repo):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Repo multi-konteks (ditandai dengan keberadaan `GLOSSARY-MAP.md` di root):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← keputusan untuk seluruh sistem
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← keputusan khusus konteks
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Gunakan istilah dalam glosarium

Saat menyebut konsep domain dalam keluaran (judul isu, usulan refaktor, hipotesis, atau nama pengujian), gunakan istilah seperti yang didefinisikan di `GLOSSARY.md`. Jangan menggantinya dengan sinonim yang secara khusus dihindari oleh glosarium.

Jika konsep yang dibutuhkan belum ada dalam glosarium, itu pertanda bahwa istilah tersebut mungkin tidak digunakan proyek (pertimbangkan kembali), atau memang ada kekosongan yang perlu dicatat untuk `/domain-modeling`.

## Tandai konflik dengan ADR

Jika keluaran bertentangan dengan ADR yang sudah ada, nyatakan konfliknya secara jelas dan jangan diam-diam mengabaikannya:

> _Bertentangan dengan ADR-0007 (pesanan berbasis event), tetapi layak dibahas kembali karena…_
