# Sepotong

Game tebak lagu Indonesia dengan potongan 0,1 detik. Pemain mendengar potongan pendek, mengetik judulnya, dan setiap tebakan yang salah membuka potongan yang sama lebih panjang: 0,1 → 0,5 → 2 → 8 → 15 detik. Skornya bukan poin, tapi **beruntun** (jumlah lagu yang ditebak benar tanpa terputus) dan waktu tebak.

Tampilan mengikuti tata letak Songspot (songspot.net): tiga kolom dengan panel genre/era/kesulitan di kiri, area putar di tengah, dan panel pemutaran di kanan. Isinya khusus lagu Indonesia.

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
| Area tengah | logo, navigasi genre cepat, pil kesulitan, slider panjang potongan, tombol putar 140px, kolom tebakan + tombol aksi, tiga kartu bantuan |
| Sidebar kanan (370px) | mode pemutaran, easy search, "tebak setelah" (durasi awal), volume, UI options |

Area tengah memakai `clip-path` untuk siluet trapesium seperti referensi. Di layar di bawah 900px kedua sidebar berubah menjadi drawer yang dibuka dari bar atas, dan konten tengah mengalir normal tanpa gulir mendatar.

## Alur satu lagu

1. Klip diputar otomatis setelah pemain mengetuk tombol putar pertama (peramban butuh gestur pengguna untuk audio).
2. Pemain mengetik judul. Saran muncul dari bank lagu; memilih saran hanya mengisi kolom, tebakan dikirim lewat tombol Tebak atau Enter.
3. Tebakan salah: potongan dibuka ke tahap berikutnya dari titik yang sama dan diputar otomatis. Judul yang sudah ditebak hilang dari saran.
4. Saat kolom kosong, tombol aksi berubah menjadi **Lewati ke …** dan hanya membuka potongan berikutnya. Di tahap 15 detik tombolnya menjadi **Nyerah**.
5. Jawaban benar: beruntun bertambah, waktu tebak tercatat, layar jawaban muncul dengan cover, judul, artis, tahun, genre, pemutar 30 detik, dan tautan Apple Music bila ada.

## Kesulitan

Songspot menentukan Easy–Impossible dari jumlah stream lagu. Angka itu tidak tersedia untuk bank lagu ini, jadi versi ini memakai ukuran yang benar-benar bisa dihitung dari data: **banyaknya lagu artis tersebut di dalam bank**.

| Tingkat | Arti | Jumlah lagu |
| --- | --- | --- |
| Easy | artis punya ≥5 lagu di bank | 39 |
| Medium | 4 lagu | 36 |
| Hard | 3 lagu | 45 |
| Expert | 2 lagu | 42 |
| Impossible | 1 lagu | 26 |

Asumsinya: bank ini disusun dari lagu-lagu yang dikenal, jadi artis yang muncul berkali-kali lebih besar peluangnya dikenali. Ini proksi, bukan angka streaming, dan ditulis apa adanya supaya tidak terlihat seperti data yang dikarang.

## Panel kanan

- **Bagian ramai / Dari awal lagu** — titik mulai potongan: bagian yang volumenya cukup, atau detik 0.
- **Preview 30 detik** — bantuan: membuka semua tahap (tahap 5) lalu memutar preview penuh.
- **Easy search** — menerima ketikan sebagian, tidak harus memilih dari saran.
- **Tebak setelah** — durasi awal tiap lagu baru (0,1s sampai 15s).
- **Volume** — penguatan audio di mesin Web Audio.
- **UI options** — suara efek, getar, kurangi gerak.

## Audio

- Sumber: preview resmi 30 detik dari katalog iTunes / Apple Music (`itunes.apple.com/search`, negara ID). Tidak ada berkas audio di repo, jadi butuh internet.
- Pemutaran memakai Web Audio API (`AudioBufferSourceNode.start(0, offset, durasi)`). Diukur di Chrome: 0,1 s → 0,104 s; 2 s → 2,009 s; 15 s → 15,008 s (selisih 4–9 ms).
- Preview iTunes mengirim `Access-Control-Allow-Origin: *`, jadi bisa di-fetch dan di-decode langsung dari browser tanpa server sendiri.
- Titik mulai diacak di rentang 3–13 detik lalu digeser ke bagian yang volumenya minimal 35% dari puncak preview (RMS jendela 0,1 detik), supaya potongan 0,1 detik tidak jatuh di bagian hening.

## Beruntun dan penyimpanan

- `sepotong:v2:streak` menyimpan `{ current, best }`; `sepotong:v2:settings` menyimpan filter dan preferensi.
- Beruntun naik untuk setiap lagu yang ditebak benar, dan kembali ke nol saat nyerah, salah di tahap terakhir, atau keluar.
- Rekor tidak pernah turun. Nilai dari kunci versi lama (`sepotong:v1:streak`) dipakai sekali saat pembukaan pertama.

## Isi repo

| File | Fungsi |
| --- | --- |
| `index.html` | struktur tiga kolom dan empat sheet |
| `style.css` | token warna gelap + aksen hijau, grid, trapesium, drawer |
| `app.js` | mesin audio, pencarian judul, alur permainan, beruntun, panel |
| `songs.js` | bank lagu (188 entri): judul, artis, tahun, genre, cover, preview |
| `og-image.png` | gambar 1200×630 untuk pratinjau tautan |
