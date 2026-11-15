# Sepotong

Game tebak lagu Indonesia. Dengar potongan **0,1 detik**, tebak judulnya. Kalau mentok, buka potongannya ke 0,5 → 2 → 8 → 15 detik, tapi poinnya turun.

Referensi mekanik: songspot.net (versi aslinya pakai lagu luar). Versi ini bank lagunya Indonesia, UI dan aturannya dirombak.

## Cara jalanin

Buka `index.html` langsung (dobel klik). Nggak ada build step, nggak ada dependency.

Kalau mau lewat server lokal:

```
python -m http.server 8000
```

lalu buka http://127.0.0.1:8000

## Isi

| File | Fungsi |
| --- | --- |
| `index.html` | struktur 3 layar: start, main, hasil |
| `style.css` | tema gelap tunggal accent teal, semua token warna di `:root` |
| `app.js` | state game, burst audio presisi, scoring, localStorage rekor |
| `songs.js` | bank lagu (188 entri) — judul, artis, tahun, genre, cover, preview |

## Soal audio

- Sumber: preview resmi 30 detik dari katalog iTunes / Apple Music (endpoint `itunes.apple.com/search`, negara ID).
- Semua 188 URL preview sudah dicek balik: HTTP 200, `Content-Type: audio/*`, ukuran > 50 KB.
- Potongan dimainkan dengan seek ke offset acak 3–13 detik lalu distop via `requestAnimationFrame`, jadi panjangnya sesuai (0,1 / 0,5 / 2 / 8 / 15 detik, toleransi ±40 ms).
- Kalau suatu saat URL preview mati, `app.js` otomatis cari ulang lewat iTunes Search API (`refreshPreview`).
- Butuh internet. Nggak ada file audio yang disimpan di repo.

## Aturan main

- 10 soal per sesi, 4 pilihan judul, salah = 0 poin dan langsung dibuka jawabannya.
- Poin maksimum per soal: 100 (jawab dari 0,1 detik), lalu 75 / 50 / 30 / 15 sesuai panjang potongan yang dibuka.
- Rekor per kombinasi filter disimpan di `localStorage` (`sepotong.best.v1`).
- Keyboard: `1`–`4` jawab, `spasi` dengar ulang, `enter` lanjut.

## Nambah lagu

Tambah objek ke `songs.js` mengikuti bentuk yang ada (`art`, `preview` dari iTunes), lalu naikkan ulang `id` kalau perlu. Filter era di `app.js` pakai `year`, filter genre pakai `genre`.
