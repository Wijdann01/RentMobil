"# Jalanin Rental

Website rental mobil dengan katalog, dashboard admin, dan Supabase."

Armada dan booking tidak lagi memakai data contoh lokal. Website dan dashboard mengambil armada langsung dari tabel `public.vehicles` Supabase; tambahkan armada yang benar melalui dashboard admin. Skema baru tidak lagi memasukkan contoh Toyota/Honda.

Jika database lama masih berisi empat armada contoh, jalankan `supabase/remove-demo-vehicles.sql` melalui Supabase SQL Editor. Skrip menghapus contoh yang belum pernah dipakai booking, dan hanya menonaktifkan contoh yang masih dirujuk booking agar riwayat pelanggan tetap aman. Jangan hapus baris tersebut secara manual dari tabel `vehicles` selama ada booking yang merujuknya."

## Menjalankan booking secara lokal

Jalankan `npm run dev` seperti biasa. Vite menyediakan endpoint backend lokal `POST /api/bookings`.

Untuk menyimpan booking ke Supabase, buat file `.env.local` berisi variabel server dari `.env.example`. `SUPABASE_URL` sebaiknya menggunakan Project URL Supabase (URL dasar); jika nilainya masih berakhiran `/rest/v1`, API akan menormalkannya:

- `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dari pengaturan API Supabase. Service role key hanya untuk server lokal; jangan beri awalan `VITE_`.
- `TURNSTILE_SECRET_KEY` untuk secret key widget Turnstile yang sama dengan `VITE_TURNSTILE_SITE_KEY`.
- `RATE_LIMIT_HASH_SECRET` berupa nilai acak minimal 32 karakter.
- `ALLOWED_ORIGINS` harus sesuai dengan alamat lokal yang dibuka, termasuk protokol dan port, misalnya `http://localhost:5173`. Jika Vite berpindah port, sesuaikan nilainya.

Setelah mengubah environment, hentikan lalu jalankan ulang `npm run dev`. Jika server secrets belum diatur, endpoint akan merespons `503` dengan pesan konfigurasi, bukan `404`. Jangan pernah commit `.env.local`, `.env`, Turnstile secret, atau Supabase service role key.

## Gambar utama halaman depan

Gambar hero di beranda bisa diganti atau dihapus dari tab **Tampilan** di dashboard admin. Untuk penyimpanan cloud lintas pengunjung, jalankan `supabase/site-images.sql` sekali di SQL Editor Supabase setelah `supabase/storage.sql`. Migrasi ini hanya membuat bucket `site-images` dan kebijakan akses storage; tidak mengubah struktur tabel. Admin dapat mengunggah JPG, PNG, atau WebP sampai 5 MB. Tanpa Supabase, gambar hanya tersimpan lokal di browser (maksimal 1 MB)."

## Nomor polisi dan biaya sopir

Jalankan `supabase/fleet-pricing.sql` sekali di SQL Editor setelah `supabase/public-booking.sql`. Migrasi ini menambah tabel privat `vehicle_units` untuk menyimpan satu nomor polisi per unit (tidak dibaca publik), tabel `rental_settings` untuk tarif sopir, serta memperbarui RPC booking agar total dihitung di database. Biaya sopir awalnya Rp100.000 per hari untuk semua layanan dan dapat diubah admin pada menu **Tarif**. Total = (harga mobil per hari + biaya sopir per hari) × lama sewa, dengan minimal satu hari. Pelanggan dapat memasukkan alamat tujuan; alamat tetap wajib untuk layanan yang mensyaratkannya.

Setiap armada harus memiliki jumlah nomor polisi yang sama dengan jumlah unitnya. Isi nomor-nomor tersebut pada dashboard saat menambah atau mengedit mobil. Jumlah dan keunikan plat diperiksa di dashboard dan database. Karena migrasi tidak dapat mengetahui nomor polisi kendaraan lama, setelah menerapkannya buka tiap armada lama di dashboard dan isi nomor polisi sebelum menyimpan perubahan armada."

## Penetapan unit pada booking

Jalankan `supabase/booking-unit-assignment.sql` sekali setelah `supabase/fleet-pricing.sql`. Migrasi menambah kolom nomor polisi unit pada booking dan RPC yang hanya dapat dipanggil admin untuk mengonfirmasi booking dengan unit tertentu. Database menolak penetapan unit yang jadwalnya bentrok. Migrasi juga menambahkan tabel booking ke publikasi `supabase_realtime` agar dashboard menerima booking baru secara langsung. Jika proyek Supabase membatasi publikasi Realtime secara khusus, pastikan tabel `public.bookings` aktif pada publikasi tersebut.

Dashboard memuat ulang data saat berpindah bagian. Setelah migrasi diterapkan, booking baru akan muncul otomatis selama koneksi Realtime tersedia."
