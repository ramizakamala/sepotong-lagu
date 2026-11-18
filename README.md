# Sepotong

Game tebak lagu Indonesia. Pemain mendengar potongan **0,1 detik**. Kalau belum yakin, potongan yang sama dibuka lebih panjang: 0,5 → 2 → 8 → 15 detik, dan poin turun tiap kali dibuka. Satu sesi 10 soal.

Referensi mekanik: songspot.net (versi aslinya memakai lagu luar). Bank lagu, aturan skor, dan tampilan di sini dibuat sendiri.

## Cara jalanin

Buka `index.html` langsung (dobel klik). Tidak ada build step dan tidak ada dependency.

Kalau mau lewat server lokal:

```
python -m http.server 8000
```

lalu buka http://127.0.0.1:8000

## Isi

| File | Fungsi |
| --- | --- |
| `index.html` | struktur layar Beranda, Main, Jawaban, Ringkasan, dan tiga sheet |
| `style.css` | token desain di `:root`, tema terang + gelap, tata letak satu kolom |
| `app.js` | mesin audio Web Audio API, alur permainan, skor, penyimpanan lokal |
| `songs.js` | bank lagu (188 entri): judul, artis, tahun, genre, cover, preview |
| `og-image.png` | gambar 1200×630 untuk pratinjau tautan |

## Audio

- Sumber: preview resmi 30 detik dari katalog iTunes / Apple Music (`itunes.apple.com/search`, negara ID). Tidak ada file audio di repo, jadi butuh internet.
- Pemutaran memakai Web Audio API (`AudioBufferSourceNode.start(0, offset, durasi)`), bukan `<audio>` + timer. Diukur di Chrome: 0,1 s → 0,10 s; 0,5 s → 0,51 s; 2 s → 2,01 s; 8 s → 8,01 s; 15 s → 15,01 s (selisih 1–11 ms).
- Preview iTunes mengirim `Access-Control-Allow-Origin: *`, jadi bisa di-fetch dan di-decode langsung dari browser. Ini yang membuat Web Audio bisa dipakai tanpa server sendiri; sudah diperiksa lewat header respons.
- Titik mulai diacak di rentang 3–13 detik, lalu digeser ke bagian yang volumenya minimal 35% dari puncak preview (RMS jendela 0,1 detik). Tujuannya supaya potongan 0,1 detik tidak pernah jatuh di bagian hening. Titik mulai yang sama dipakai untuk semua tahap.
- Soal berikutnya di-preload selagi pemain berpikir. Kalau satu lagu gagal dimuat, dicoba sekali lagi, lalu diganti lagu lain tanpa mengurangi jumlah soal.
- Satu suara aktif pada satu waktu; memutar yang baru menghentikan yang lama.

## Aturan main

- 10 soal per sesi, 4 pilihan judul, tanpa batas waktu.
- Poin per soal menurut tahap saat benar: 100 / 70 / 45 / 25 / 10. Salah tidak mengakhiri soal: jawaban salah dimatikan, klip dibuka ke tahap berikutnya (poin ikut turun), lalu pemain masih boleh menebak.
- Tombol Lewati membuka tahap berikutnya tanpa menebak; di tahap terakhir berubah jadi menyerah (0 poin).
- Ringkasan menampilkan skor dari 1000, gelar, grid emoji hasil, akurasi, rata-rata tahap, dan rincian per soal. Teks bagikan tidak memuat judul lagu.
- Keyboard: `1`–`4` menjawab, `spasi` memutar ulang, `enter` lanjut, `esc` menutup sheet.
- Tema terang dan gelap mengikuti preferensi sistem dan bisa dipaksa lewat Pengaturan. Pilihan tema, suara efek, dan getar disimpan di `localStorage` (`sepotong:v1:*`).

## Catatan implementasi

- Dua warna di spesifikasi gagal uji kontras pada latar terang: `--warn #E0A100` (2,12:1) dan `--orange #E87A1E` (2,72:1), padahal komponen UI minimal 3:1. Keduanya digelapkan jadi `#B37F00` (3,30:1) dan `#C05F0C` (4,03:1); pasangan warna lain lolos apa adanya, termasuk `--accent-ink` di atas `--accent` (4,59:1).
- Bank lagu belum punya URL Apple Music per lagu, jadi tautan "Buka di Apple Music" disembunyikan sesuai aturan (tautan hanya tampil kalau URL tersedia).
- Bonus beruntun (bagian 8 spesifikasi) belum diterapkan karena masuk fase P2; chip 🔥 tetap menampilkan jumlah jawaban benar berurutan. Skor maksimum tetap 1000.
- Yang belum ada (fase berikutnya): mode Harian, mode Susah dengan autocomplete, Statistik, Survival, Satu Artis, petunjuk artis, dan genre tambahan.

## Nambah lagu

Tambah objek ke `songs.js` mengikuti bentuk yang ada (`art`, `preview` dari iTunes), lalu sesuaikan `id`. Filter era memakai `year`, filter genre memakai `genre`.
