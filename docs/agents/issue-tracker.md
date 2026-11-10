# Pelacak isu: GitHub

Isu dan spesifikasi untuk repo ini dikelola sebagai GitHub Issues. Gunakan CLI `gh` untuk semua operasi.

## Kebiasaan kerja

- **Buat isu**: `gh issue create --title "..." --body "..."`. Gunakan heredoc untuk isi yang terdiri dari beberapa baris.
- **Baca isu**: `gh issue view <number> --json number,title,body,labels,comments`.
- **Daftar isu**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` dengan filter `--label` dan `--state` yang sesuai.
- **Jadikan isu sebagai sub-isu**: `gh issue create --parent <parent> ...`, atau jalankan `gh issue edit <parent> --add-sub-issue <child>` setelahnya (`gh` 2.94+). Untuk versi `gh` yang lebih lama: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, seperti dijelaskan pada **Dependensi** di bawah). Jika sub-isu tidak tersedia, tulis `Part of #<parent>` di awal isi isu anak.
- **Dependensi**: gunakan **dependensi isu bawaan GitHub**, representasi resmi yang terlihat di antarmuka. Tambahkan dependensi dengan `gh issue create --blocked-by <n>,<n> ...` atau `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). Untuk `gh` versi lama: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, dengan `<blocker-db-id>` berupa **database id** numerik dari isu penghambat (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _bukan_ `#number` atau `node_id`). Jika dependensi tidak tersedia, tulis `Blocked by: #<n>, #<n>` di awal isi isu anak. Isu tidak lagi terhambat setelah semua isu penghambat ditutup.
- **Hitung isu penghambat yang masih terbuka**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` (hanya menghitung isu penghambat yang terbuka; 0 berarti isu siap dikerjakan). `gh issue view <n> --json blockedBy` juga menampilkan isu penghambat yang sudah ditutup, jadi gunakan filter: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Beri komentar pada isu**: `gh issue comment <number> --body "..."`
- **Terapkan / hapus label**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Tutup isu**: kirim penjelasan dengan `gh issue comment <number> --body "..."`, lalu jalankan `gh issue close <number>`. Jika isu sudah ditutup, `gh issue close --comment` tidak menambahkan komentar, meskipun perintahnya tetap keluar dengan kode 0.

Repo ditentukan dari `git remote -v`; `gh` melakukannya otomatis saat dijalankan dari dalam clone.

Buat isu hanya di repo milik pengguna. Jangan pernah membuat isu di `mattpocock/skills` (repo asal skill ini), kecuali pengguna memang memilikinya. Pada fork, `gh` dapat memilih repo induk sebagai default. Sebelum menjalankan `gh issue create` pertama kali dalam satu sesi, periksa target dengan `gh repo view --json nameWithOwner`; minta konfirmasi pengguna jika targetnya bukan repo milik mereka.

## Pull request sebagai sumber permintaan untuk triase

**PR sebagai sumber permintaan: tidak.** _(Ubah menjadi `yes` jika repo ini menganggap PR eksternal sebagai usulan fitur; `/triage` membaca penanda ini.)_

Jika diubah menjadi `yes`, PR diproses dengan label dan status yang sama seperti isu, menggunakan perintah `gh pr` yang setara:

- **Baca PR**: `gh pr view <number>`, lalu `gh pr view <number> --comments` (di luar TTY, `--comments` hanya menampilkan komentar, bukan isi PR), dan `gh pr diff <number>` untuk melihat diff.
- **Daftar PR eksternal untuk triase**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Beri komentar / ubah label / tutup PR**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub menggunakan ruang nomor yang sama untuk isu dan PR, jadi `#42` saja dapat merujuk ke salah satunya. Pastikan dengan `gh pr view 42`; jika bukan PR, periksa `gh issue view 42`.

## Saat skill meminta "terbitkan ke pelacak isu"

Buat GitHub Issue.

## Saat skill meminta "ambil tiket yang relevan"

Baca isu seperti yang dijelaskan pada bagian **Baca isu** di atas.

## Operasi Wayfinding

Bagian ini digunakan oleh `/wayfinder`. **Peta** adalah satu isu yang memiliki isu-isu **anak** sebagai tiket.

- **Peta**: satu isu berlabel `wayfinder:map`, berisi bagian Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Tiket anak**: isu yang ditautkan ke peta sebagai sub-isu GitHub (lihat **Jadikan isu sebagai sub-isu**). Jika sub-isu tidak tersedia, tambahkan isu anak ke daftar tugas pada isi peta dan tulis `Part of #<map>` di awal isi isu anak. Label: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Setelah diklaim, tiket ditugaskan kepada pengembang yang mengerjakannya.
- **Dependensi**: lihat bagian **Dependensi** pada **Kebiasaan kerja**.
- **Pencarian tiket siap dikerjakan**: daftar isu anak peta yang masih terbuka (`gh issue list --state open`, dibatasi ke sub-isu atau daftar tugas peta), lalu keluarkan isu yang memiliki penghambat terbuka (lihat **Hitung isu penghambat yang masih terbuka**, atau baris `Blocked by` yang merujuk isu terbuka) atau sudah ditugaskan. Pilih isu pertama sesuai urutan pada peta.
- **Klaim**: `gh issue edit <n> --add-assignee @me`; ini adalah operasi tulis pertama dalam sesi.
- **Selesaikan**: `gh issue comment <n> --body "<answer>"`, lalu `gh issue close <n>`, kemudian tambahkan rujukan konteks (gist + tautan) pada bagian Decisions-so-far di peta.
