-- Jalankan sekali setelah schema.sql pada proyek Supabase yang sudah ada.
alter table public.vehicles
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-images',
  'vehicle-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read vehicle images" on storage.objects;
create policy "Anyone can read vehicle images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'vehicle-images');

drop policy if exists "Admins can upload vehicle images" on storage.objects;
create policy "Admins can upload vehicle images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-images'
  and (select public.is_rental_admin())
);

drop policy if exists "Admins can update vehicle images" on storage.objects;
create policy "Admins can update vehicle images"
on storage.objects for update to authenticated
using (
  bucket_id = 'vehicle-images'
  and (select public.is_rental_admin())
)
with check (
  bucket_id = 'vehicle-images'
  and (select public.is_rental_admin())
);

drop policy if exists "Admins can delete vehicle images" on storage.objects;
create policy "Admins can delete vehicle images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-images'
  and (select public.is_rental_admin())
);
