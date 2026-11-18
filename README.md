# Sepotong

Game tebak lagu Indonesia dengan potongan 0,1 detik. Pemain mendengar potongan pendek, mengetik judul lagunya, dan setiap tebakan yang salah membuka potongan yang sama lebih panjang: 0,1 → 0,5 → 2 → 8 → 15 detik. Skornya bukan poin, tapi **beruntun** (jumlah lagu yang ditebak benar tanpa terputus) dan waktu tebak.

Sistemnya mengikuti Songspot (songspot.net): ketik judul, salah tebak membuka klip, lewati atau menyerah memutus beruntun. Bedanya, bank lagu di sini khusus lagu Indonesia.

## Cara jalanin

Buka `index.html` langsung (dobel klik). Tidak ada build step dan tidak ada dependency.

Kalau mau lewat server lokal:

```
python -m http.server 8000
```

lalu buka http://127.0.0.1:8000

## Alur satu lagu

1. Klip 0,1 detik diputar otomatis. Tombol putar dan tombol spasi memutar ulang potongan yang sama tanpa biaya.
2. Pemain mengetik judul. Saran muncul dari bank lagu (judul dan nama artis), maksimal 6 baris, dan jawaban diambil dari saran itu supaya tidak ada salah ketik yang dihitung salah.
3. Tebakan salah: potongan dibuka ke tahap berikutnya dari titik yang sama dan diputar otomatis. Tebakan yang sudah dicoba ditandai.
4. Benar: beruntun bertambah, waktu tebak tercatat, dan layar jawaban muncul dengan cover, judul, artis, tahun, genre, pemutar 30 detik, dan tautan Apple Music kalau ada.
5. Salah di tahap terakhir, lewati, atau menyerah: beruntun kembali ke nol, rekor tetap tersimpan. Layar jawaban menampilkan lagu yang sebenarnya.

## Isi

| File | Fungsi |
| --- | --- |
| `index.html` | struktur layar Beranda, Main, Jawaban, dan dua sheet |
| `style.css` | token desain di `:root`, tema terang + gelap, tata letak satu kolom |
| `app.js` | mesin audio Web Audio API, pencocokan judul, alur permainan, beruntun |
| `songs.js` | bank lagu (188 entri): judul, artis, tahun, genre, cover, preview |
| `og-image.png` | gambar 1200×630 untuk pratinjau tautan |

## Audio

- Sumber: preview resmi 30 detik dari katalog iTunes / Apple Music (`itunes.apple.com/search`, negara ID). Tidak ada berkas audio di repo, jadi butuh internet.
- Pemutaran memakai Web Audio API (`AudioBufferSourceNode.start(0, offset, durasi)`), bukan `<audio>` + timer. Diukur di Chrome: 0,1 s → 0,104 s; 2 s → 2,009 s; 15 s → 15,008 s (selisih 4–9 ms).
- Preview iTunes mengirim `Access-Control-Allow-Origin: *`, jadi bisa di-fetch dan di-decode langsung dari browser tanpa server sendiri.
- Titik mulai diacak di rentang 3–13 detik lalu digeser ke bagian yang volumenya minimal 35% dari puncak preview (RMS jendela 0,1 detik), supaya potongan 0,1 detik tidak jatuh di bagian hening. Titik yang sama dipakai untuk semua tahap.
- Bisa diganti ke "awal lagu" lewat Pengaturan: potongan dimulai dari detik 0.
- Lagu berikutnya di-preload saat pemain masih mengetik. Kalau satu lagu gagal dimuat, dicoba sekali lagi lalu diganti lagu lain.

## Beruntun dan rekor

- `localStorage` kunci `sepotong:v1:streak` menyimpan `{ current, best }`.
- Beruntun naik untuk setiap lagu yang ditebak benar, dan kembali ke nol saat pemain kalah, lewati, menyerah, atau keluar dari sesi.
- Rekor (beruntun terbaik) tidak pernah turun.

## Catatan implementasi

- Kesulitan bertingkat ala Songspot (Easy sampai Impossible) **tidak** diadopsi. Di sana tingkat kesulitan ditentukan dari jumlah stream lagu; data itu tidak tersedia untuk bank lagu Indonesia di sini, dan menebaknya berarti mengarang angka. Penyeimbang kesulitan di versi ini: filter genre dan era, plus pilihan titik mulai.
- Bank lagu belum punya URL Apple Music per lagu, jadi tautan "Buka di Apple Music" hanya muncul kalau URL tersedia.
- Pencocokan judul mengabaikan huruf besar, tanda baca, dan diakritik. Mengetik judul lengkap lalu Enter juga diterima, tidak harus memilih dari saran.

## Nambah lagu

Tambah objek ke `songs.js` mengikuti bentuk yang ada (`art`, `preview` dari iTunes), lalu sesuaikan `id`. Filter era memakai `year`, filter genre memakai `genre`.
