# Spekulasi

Game tebak lagu Indonesia dari potongan 0,1 detik. Pemain mendengar potongan pendek, mengetik judulnya, dan setiap tebakan yang salah membuka potongan yang sama lebih panjang: 0,1 → 0,5 → 2 → 8 → 15 detik.

Satu level terdiri dari satu lagu acak. Benar berarti naik level; salah berarti level tetap di tempat dan lagunya diganti.

Tata letaknya mengikuti Songspot (songspot.net): tiga kolom dengan panel genre/era/kesulitan di kiri, area putar di tengah, dan panel pemutaran di kanan. Warnanya bukan tiruan Songspot: dipakai palet oranye hangat dengan dua tema, terang dan gelap.

## Cara jalanin

Buka `index.html` langsung (dobel klik). Tidak ada build step dan tidak ada dependency.

Kalau mau lewat server lokal:

```
python -m http.server 8000
```

lalu buka http://127.0.0.1:8000

## Tata letak

| Bagian | Isi |
| --- | --- |
| Sidebar kiri (260px) | menu, dropdown genre, dropdown era, lima tingkat kesulitan, reroll lagu |
| Area tengah | nama situs, navigasi cepat yang bisa digeser (genre atau tahun), pil kesulitan, slider panjang potongan, tombol putar 140px, kolom tebakan + tombol aksi, tiga kartu bantuan |
| Sidebar kanan (370px) | mode pemutaran, saran judul, "tebak setelah", volume, UI options (termasuk tema) |

Area tengah memakai `clip-path` untuk siluet trapesium. Di layar di bawah 900px kedua sidebar berubah menjadi drawer dari bar atas.

Tombol di kiri baris navigasi mengganti isinya antara **Genre** dan **Tahun**; barisnya bisa digeser kiri-kanan lewat usapan, tarikan mouse, atau roda tetikus, dengan penanda tepi yang hanya muncul ketika isinya memang lebih lebar.

## Alur satu level

1. Ketuk tombol putar. Selama potongan berbunyi, ikon tombolnya berubah menjadi tanda jeda dan bisa ditekan untuk berhenti.
2. Ketik judulnya (minimal 3 huruf), pilih dari saran, lalu tekan **Tebak** atau Enter.
3. Salah tebak: potongan yang sama dibuka lebih panjang. Judul yang sudah ditebak hilang dari daftar saran.
4. Kolom kosong membuat tombol yang sama menjadi **Lewati**; di 15 detik tombolnya menjadi **Nyerah**.
5. Layar hasil selalu vertikal dan rata tengah: cover album, judul, artis, album (tahun) · genre, badge hasil, satu baris keterangan, lalu satu tombol.

| Keadaan | Badge | Tombol | Artefak |
| --- | --- | --- | --- |
| Salah | **Salah Lo!** — garis luar merah, latar transparan, miring | **Ulang Lah!** — level yang sama dengan lagu acak baru | level tidak naik |
| Benar | **Anjay Bener!** — garis luar hijau, latar transparan, miring | **Lanjut Bro!** — naik ke level berikutnya | level bertambah |

## Tema dan warna

Dua tema, dipilih di panel kanan → UI options → Tema: **Terang**, **Gelap**, atau **Auto** (mengikuti setelan sistem). Pilihannya disimpan dan `<meta name="theme-color">` ikut berubah.

| Token | Terang | Gelap | Dipakai untuk |
| --- | --- | --- | --- |
| `--bg` | `#FDF6EE` | `#17100B` | latar halaman dan panel samping |
| `--center` | `#F7EADB` | `#1F1710` | bidang trapesium |
| `--surface` | `#FFFFFF` | `#241A12` | kartu, kolom tebakan, saran |
| `--accent` | `#B85110` | `#F5863C` | tombol putar, tombol utama, slider |
| `--accent-soft` | `#FBE2CB` | `#3A2314` | latar pilihan aktif |
| `--on-accent` | `#FFF8F1` | `#1B1208` | teks di atas aksen |
| `--text` | `#2A1C12` | `#F7EEE6` | teks utama |
| `--text-2` / `--muted` | `#6E5847` / `#7F6957` | `#C4B0A0` / `#9C8878` | teks kedua, label |
| `--line` | `#EFDECB` | `#3A2C20` | garis dan tepi kartu |

Tingkat kesulitan punya warnanya sendiri: Easy `#1F7A4C`, Medium `#8A6500`, Hard `#B4550A`, Expert `#B3261E`, Impossible `#6B4E9B` (versi lebih terang dipakai di tema gelap).

Kontras diukur, bukan dikira: tema terang — teks utama 15,4:1, teks kedua 6,2:1, label 4,8:1, teks di tombol aksen 4,7:1, aksen di latar 4,6:1; tema gelap — teks utama 16,4:1, teks kedua 9,0:1, label 5,6:1, teks di tombol aksen 7,4:1.

## Kesulitan

Songspot menentukan Easy–Impossible dari jumlah stream. Angka itu tidak tersedia untuk bank lagu ini, jadi dipakai ukuran yang bisa dihitung dari data: **peringkat artis menurut jumlah lagunya di bank**, dibagi rata per kuantil (masing-masing sekitar 20% dari total). Dengan 917 lagu hasilnya: Easy 192, Medium 180, Hard 185, Expert 180, Impossible 180.

Ini proksi, bukan angka streaming, dan ditulis apa adanya.

## Panel kanan

- **Bagian ramai / Dari awal lagu** — titik mulai potongan.
- **Preview 30 detik** — bantuan: membuka semua tahap lalu memutar preview penuh.
- **Saran judul** — nyala: autocomplete setelah 3 huruf, maksimal 4 baris, hanya cocok ke judul. Mati: tanpa saran, judul harus diketik lengkap.
- **Tebak setelah** — durasi awal tiap lagu baru.
- **Volume** — penguatan audio di mesin Web Audio.
- **UI options** — tema, suara efek, getar, kurangi gerak.

## Audio

- Sumber: preview resmi 30 detik dari katalog iTunes / Apple Music (`itunes.apple.com/search`, negara ID). Tidak ada berkas audio di repo, jadi butuh internet.
- Pemutaran memakai Web Audio API (`AudioBufferSourceNode.start(0, offset, durasi)`). Diukur di Chrome: 0,1 s → 0,10 s; 15 s → 15,01 s.
- Titik mulai diacak di 3–13 detik lalu digeser ke bagian yang volumenya minimal 35% dari puncak preview, supaya potongan 0,1 detik tidak jatuh di bagian hening.

## Data bank lagu

- 917 lagu dari 162 artis: 1970-an 9, 1980-an 43, 1990-an 70, 2000-an 248, 2010-an 291, 2020-an 256; pop 556, rock 132, folk 123, dangdut 85, jazz 21.
- Semua judul, artis, tahun, dan tautan preview diambil dari metadata iTunes Search API. Setiap tautan preview diperiksa: HTTP 200, tipe audio, ukuran di atas 50 KB.
- Lagu live, karaoke, remix, instrumental, dan tribute dibuang saat pengambilan; tidak ada judul/artis yang dobel.
- Tahun mengikuti metadata rilis iTunes, jadi sebagian lagu lama tercatat pada tahun album kompilasinya.

## Penyimpanan

- `sepotong:v2:level` menyimpan `{ current, best }`; `sepotong:v2:settings` menyimpan filter, tema, dan preferensi.
- Level hanya bertambah saat jawaban benar; salah atau nyerah tidak menurunkannya. Rekor menyimpan level tertinggi.

## Isi repo

| File | Fungsi |
| --- | --- |
| `index.html` | struktur tiga kolom dan empat sheet |
| `style.css` | token dua tema, grid, trapesium, drawer, layar hasil |
| `app.js` | mesin audio, pencarian judul, level, panel, tema |
| `songs.js` | bank lagu (917 entri): judul, artis, tahun, genre, cover, preview |
| `og-image.png` | gambar 1200×630 untuk pratinjau tautan |
