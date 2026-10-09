# Jalanin Rental

Website rental mobil dengan halaman katalog publik dan dashboard admin. Dibuat menggunakan Vue 3, Vite, Tailwind CSS v4, dan Supabase.

## Menjalankan secara lokal

```sh
npm install
npm run dev
```

Tanpa kredensial Supabase, aplikasi berjalan dalam **mode demo**. Katalog contoh, permintaan booking, dan perubahan dari dashboard disimpan di `localStorage` browser.

## Menghubungkan Supabase

1. Buat proyek Supabase dan jalankan isi `supabase/schema.sql` melalui SQL Editor.
2. Salin `.env.example` menjadi `.env`, lalu isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari Project Settings → API. Gunakan **Project URL** (akar URL, misalnya `https://<project-ref>.supabase.co`), bukan endpoint REST `/rest/v1`. Aplikasi juga menghapus akhiran `/rest/v1` bila ikut tersalin.
3. Tambahkan pengguna admin di Authentication → Users. Setelah pengguna dibuat, daftarkan ID UUID pengguna itu melalui SQL Editor:

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID-PENGGUNA-DARI-AUTH-USERS');
   ```

4. Jalankan `supabase/storage.sql` melalui SQL Editor. File ini membuat bucket publik `vehicle-images`, membatasi upload/hapus hanya untuk admin, serta menambahkan kolom path gambar pada tabel kendaraan.
5. Jalankan `supabase/inventory.sql` melalui SQL Editor. Migrasi ini menambahkan jumlah unit kendaraan, RPC untuk menghitung ketersediaan berdasarkan tanggal, dan trigger database yang menolak konfirmasi melebihi stok.
6. Jalankan `supabase/booking-policy.sql` melalui SQL Editor. Migrasi ini menghapus layanan lepas kunci, menambahkan layanan antar jemput stasiun dan kolom alamat, serta mencegah booking aktif duplikat untuk email, mobil, dan tanggal yang sama. Migrasi akan berhenti dengan pesan yang jelas jika data booking duplikat sudah ada agar tidak mengubah data lama secara otomatis.
7. Jalankan `supabase/public-booking.sql` melalui SQL Editor. Migrasi ini menambahkan tabel pendukung private untuk rate limit, menutup insert booking langsung dari browser, dan membuat RPC server-only yang memvalidasi ketersediaan serta menghitung harga dari tarif kendaraan di database. Tabel `vehicles`, `services`, dan `bookings` yang sudah ada tidak diubah strukturnya.
8. Skema otomatis menambahkan contoh armada dan layanan ke katalog; sesuaikan jumlah unit masing-masing mobil lewat dashboard setelah login sebagai admin.
9. Untuk development UI/demo, jalankan `npm run dev`. Untuk mengetes API booking yang membutuhkan secret server, gunakan `vercel dev` setelah konfigurasi environment lokal yang sama dengan bagian Vercel di bawah. Jangan menaruh service-role key di variabel `VITE_*`.

RLS pada skema membatasi perubahan armada, layanan, dan booking hanya untuk pengguna di `admin_users`. Pengunjung hanya dapat melihat armada tersedia dan layanan aktif serta mengirim booking berstatus `pending`. Booking **Menunggu** belum mengurangi stok; ketersediaan diperiksa ulang saat permintaan dibuat, dan stok baru terpakai setelah admin mengonfirmasi. Mobil dihitung terpakai pada seluruh tanggal dari tanggal ambil sampai tanggal kembali (inklusif), lalu otomatis tersedia lagi sehari setelah tanggal kembali. Layanan antar jemput bandara dan stasiun mewajibkan alamat atau nama lokasi jemput; database juga memvalidasi layanan masih aktif. Database menolak booking aktif duplikat untuk email, mobil, dan tanggal yang sama serta konfirmasi yang melebihi kapasitas armada. Setelah booking terkirim, pelanggan diminta mengonfirmasi kembali dengan Customer Service. Bucket gambar dapat dibaca publik agar foto mobil tampil di katalog; hanya admin terdaftar yang dapat mengunggah atau menghapus file. Form dashboard menerima JPG, PNG, dan WebP hingga 5 MB. Kunci `anon` aman digunakan pada frontend; jangan pernah menaruh `service_role` key pada aplikasi browser.

## Deploy gratis ke Vercel

> **Catatan untuk penggunaan bisnis:** Vercel Hobby gratis dibatasi untuk penggunaan personal/non-komersial menurut [ketentuan paket Hobby](https://vercel.com/docs/plans/hobby#hobby-billing-cycle). Karena situs rental dapat dipakai untuk kegiatan komersial, pastikan kelayakan paket sebelum menjadikannya layanan produksi; konfigurasi proyek tetap dapat digunakan untuk preview atau pada paket yang sesuai.

1. Buat site key dan secret key gratis di Cloudflare Turnstile. Daftarkan domain produksi pada widget Turnstile. Tambahkan domain preview Vercel hanya jika preview tersebut juga akan dipakai untuk mengetes form.
2. Import repository ini di Vercel. Framework akan terdeteksi sebagai Vite; build command `npm run build`, output directory `dist`. File `vercel.json` menangani fallback halaman Vue Router dan header keamanan, sedangkan `api/bookings.js` menjadi serverless function.
3. Tambahkan environment variables di **Project → Settings → Environment Variables**. Variabel `VITE_*` dibutuhkan saat build; variabel server hanya untuk Function dan tidak boleh diawali `VITE_`:

   | Nama | Nilai |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL Supabase |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
   | `VITE_TURNSTILE_SITE_KEY` | Turnstile site key (public) |
   | `SUPABASE_URL` | Project URL Supabase yang sama |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key |
   | `TURNSTILE_SECRET_KEY` | Turnstile secret key |
   | `RATE_LIMIT_HASH_SECRET` | Rahasia acak minimal 32 karakter untuk hashing key rate limit |
   | `ALLOWED_ORIGINS` | Origin situs, dipisahkan koma, misalnya `https://domainmu.id,https://www.domainmu.id` |

   Buat `RATE_LIMIT_HASH_SECRET` secara lokal, misalnya dengan `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Jangan masukkan nilai secret ke Git, screenshot, atau chat. Atur origin yang tepat di environment Production dan Preview; endpoint menolak origin yang tidak dicantumkan.
4. Deploy, lalu uji `/`, `/dashboard`, Turnstile, serta satu booking percobaan yang dibatalkan sebelum produksi. Admin tetap masuk melalui Supabase Auth.

Mode demo dengan `npm run dev` tidak mengirim data ke Supabase. Setelah Supabase dikonfigurasi, request booking publik harus melalui `vercel dev` atau deployment Vercel karena endpoint API memerlukan secret server.

## Build produksi

```sh
npm run build
npm run preview
```
