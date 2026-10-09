"# Proyek saya" 

## Menjalankan booking secara lokal

Jalankan `npm run dev` seperti biasa. Vite sekarang menyediakan endpoint backend lokal `POST /api/bookings`, sehingga form tidak lagi mendapat `404` hanya karena API function belum berjalan.

Untuk menyimpan booking ke Supabase, buat file `.env.local` berisi variabel server dari `.env.example`. `SUPABASE_URL` sebaiknya menggunakan Project URL Supabase (URL dasar); jika nilainya masih berakhiran `/rest/v1`, API akan menormalkannya:

- `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dari pengaturan API Supabase. Service role key hanya untuk server lokal; jangan beri awalan `VITE_`.
- `TURNSTILE_SECRET_KEY` untuk secret key widget Turnstile yang sama dengan `VITE_TURNSTILE_SITE_KEY`.
- `RATE_LIMIT_HASH_SECRET` berupa nilai acak minimal 32 karakter.
- `ALLOWED_ORIGINS` harus sesuai dengan alamat lokal yang dibuka, termasuk protokol dan port, misalnya `http://localhost:5173`. Jika Vite berpindah port, sesuaikan nilainya.

Setelah mengubah environment, hentikan lalu jalankan ulang `npm run dev`. Jika server secrets belum diatur, endpoint akan merespons `503` dengan pesan konfigurasi, bukan `404`. Jangan pernah commit `.env.local`, `.env`, Turnstile secret, atau Supabase service role key."

## Gambar utama halaman depan

Gambar hero di beranda bisa diganti atau dihapus dari tab **Tampilan** di dashboard admin. Untuk penyimpanan cloud lintas pengunjung, jalankan `supabase/site-images.sql` sekali di SQL Editor Supabase setelah `supabase/storage.sql`. Migrasi ini hanya membuat bucket `site-images` dan kebijakan akses storage; tidak mengubah struktur tabel. Admin dapat mengunggah JPG, PNG, atau WebP sampai 5 MB. Tanpa Supabase, gambar hanya tersimpan lokal di browser (maksimal 1 MB)."
