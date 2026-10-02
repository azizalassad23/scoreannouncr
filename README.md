# Pengumuman Nilai

Halaman pengumuman nilai siswa. Siswa mengetik NIS, membuka kartu misteri, lalu melihat nilainya. Setiap nilai tampil bersama GIF, suara, dan confetti sesuai tiernya. Data nilai diambil dari Google Sheets. Halaman di-host di GitHub Pages.

- `index.html`: halaman siswa
- `admin.html`: panel guru untuk mengatur link sheet dan meng-upload GIF/suara

## Tier

| Tier | Nilai |
| --- | --- |
| Excellent | di atas 95 |
| Awesome | di atas 90 sampai 95 |
| Great | di atas 80 sampai 90 |
| Good | di atas 75 sampai 80 |
| Keep Going | 75 ke bawah |

Batas tier memakai "lebih dari", jadi nilai 95 masuk Awesome dan nilai 90 masuk Great. Untuk mengubah batas atau pesan, edit `TIERS` di `assets/js/common.js`.

## 1. Siapkan Google Sheets

Baris pertama berisi judul kolom. Ada tiga format yang didukung:

**A. Satu baris per mapel, dengan kolom Mapel (disarankan)**

| NIS | Nama | Mapel | Nilai |
| --- | --- | --- | --- |
| 1001 | Raka Pratama | Matematika | 98 |
| 1001 | Raka Pratama | IPA | 92 |

**B. Satu baris per siswa, setiap mapel menjadi kolom**

| NIS | Nama | Matematika | IPA |
| --- | --- | --- | --- |
| 1001 | Raka Pratama | 98 | 92 |

**C. Satu baris per mapel, tanpa kolom Mapel**

| NIS | Nama | Nilai |
| --- | --- | --- |
| 1001 | Raka Pratama | 98 |
| 1001 | Raka Pratama | 92 |

Untuk format C, isi "Nama mapel" di panel guru (misalnya `Matematika, IPA`). Urutan nama mengikuti urutan baris tiap siswa. Tanpa isian ini, mapel tampil sebagai "Mapel 1" dan "Mapel 2".

Kolom `Kelas`, `Keterangan`, dan `Catatan` diabaikan. Nilai desimal boleh memakai koma atau titik.

Lalu publikasikan sheet:

1. Buka **File › Bagikan › Publikasikan ke web**.
2. Pilih sheet yang berisi nilai, lalu pilih format **Nilai yang dipisahkan koma (.csv)**.
3. Klik **Publikasikan** dan salin link-nya.

> **Penting:** sheet yang dipublikasikan bisa dibaca oleh siapa pun yang punya link-nya. Siswa yang paham teknis bisa melihat nilai semua siswa lewat link itu. Jangan masukkan data lain yang sensitif ke sheet ini. Publikasikan hanya sheet nilai, jangan seluruh dokumen.

Google memperbarui CSV yang dipublikasikan beberapa menit setelah sheet diedit.

## 2. Upload ke GitHub Pages

1. Buat repo baru di GitHub, misalnya `pengumuman-nilai`.
2. Upload semua file di folder ini ke repo (**Add file › Upload files**). Folder `.claude` tidak perlu di-upload.
3. Buka **Settings › Pages**. Di "Build and deployment", pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
4. Setelah sekitar 1 menit, halaman aktif di `https://<username>.github.io/pengumuman-nilai/`.

Tanpa link sheet, halaman berjalan dalam mode demo memakai `sample.csv` (NIS 1001–1005).

## 3. Buat token untuk panel guru

Panel guru menyimpan file langsung ke repo lewat token GitHub milik Anda.

1. Buka GitHub › **Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token**.
2. **Repository access:** pilih *Only select repositories*, lalu pilih repo pengumuman nilai saja.
3. **Permissions › Repository permissions › Contents:** pilih *Read and write*.
4. Pilih masa berlaku yang pendek (misalnya 30 hari), lalu buat token dan salin.

Token hanya disimpan di browser Anda, dan hanya jika "Ingat token" dicentang. Jangan bagikan token. Kalau token bocor, hapus token itu di halaman yang sama di GitHub.

## 4. Pakai panel guru

Buka `https://<username>.github.io/pengumuman-nilai/admin.html`.

1. **Koneksi GitHub:** isi token, lalu klik **Hubungkan**. Pemilik dan nama repo terisi otomatis.
2. **Data Google Sheets:** tempel link CSV, lalu klik **Tes data** untuk memastikan sheet terbaca.
3. **GIF & suara per tier:** pilih file untuk tiap tier. Anda bisa langsung mencoba putar di sana.
4. Klik **Simpan & Publikasikan**. Halaman siswa ter-update sekitar 1 menit kemudian.

Format GIF: gif, webp, png, jpg. Format suara: mp3, wav, ogg, m4a. Maksimal 20 MB per file. Supaya halaman cepat dibuka di HP, usahakan tiap file di bawah 3 MB. Tier tanpa file suara memakai nada bawaan.

Cara manual tanpa panel guru: upload file ke folder `media/` di repo, lalu edit `config.json` dan isi path-nya, misalnya `"gif": "media/excellent.gif"`.

## 5. QR code untuk siswa

Di bagian bawah `admin.html`, bagian **QR code untuk siswa** membuat QR yang mengarah ke halaman siswa.

- Link terisi otomatis dengan alamat GitHub Pages.
- Gambar tengah bisa memakai logo A+ bawaan, gambar sendiri, atau tanpa gambar. QR memakai koreksi error level H, jadi tetap terbaca walaupun bagian tengahnya tertutup gambar.
- Klik **Unduh PNG** untuk menyimpan, atau **Cetak** untuk langsung mencetak.

Tes scan dengan HP sebelum dicetak banyak. Pilih warna QR yang gelap.

## Menjalankan di komputer sendiri

Buka folder ini lewat server lokal apa saja, misalnya `npx serve`, lalu buka `index.html`. Halaman tidak bisa dibuka dengan klik dua kali (`file://`), karena browser memblokir `fetch` di mode itu.
