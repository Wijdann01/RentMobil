-- Jalankan sekali setelah schema.sql, inventory.sql, dan storage.sql.
alter table public.services
  add column if not exists requires_address boolean not null default false;

alter table public.bookings
  add column if not exists pickup_address text;

update public.services
set requires_address = true
where id in ('service-3', 'service-4')
   or lower(name) in ('antar jemput bandara', 'antar jemput stasiun');

update public.services
set
  name = 'Mobil + sopir',
  description = 'Perjalanan lebih santai ditemani sopir profesional kami.',
  icon = 'user-round',
  requires_address = false,
  active = true
where id = 'service-2';

update public.services
set requires_address = true
where id = 'service-3';

insert into public.services (id, name, description, icon, active, requires_address)
values (
  'service-4',
  'Antar jemput stasiun',
  'Layanan antar jemput dari atau ke stasiun pilihanmu.',
  'train-front',
  true,
  true
)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  active = true,
  requires_address = true;

delete from public.services
where id = 'service-1' or lower(name) = 'lepas kunci';

do $$
begin
  if exists (
    select 1
    from public.services
    group by lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception 'Ada nama layanan duplikat. Periksa tabel public.services sebelum menjalankan migrasi ini.';
  end if;

  if exists (
    select 1
    from public.bookings
    where status in ('pending', 'confirmed')
    group by lower(btrim(customer_email)), car_id, pickup_date, return_date
    having count(*) > 1
  ) then
    raise exception 'Ada booking aktif duplikat. Periksa email, mobil, dan tanggal booking di tabel public.bookings sebelum menjalankan migrasi ini.';
  end if;
end;
$$;

create unique index if not exists services_unique_normalized_name
on public.services (lower(btrim(name)));

create unique index if not exists bookings_unique_active_customer_vehicle_dates
on public.bookings (lower(btrim(customer_email)), car_id, pickup_date, return_date)
where status in ('pending', 'confirmed');

create or replace function public.validate_booking_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  service_requires_address boolean;
begin
  new.customer_name := btrim(new.customer_name);
  new.customer_email := lower(btrim(new.customer_email));
  new.customer_phone := btrim(new.customer_phone);

  if length(new.customer_name) < 2 or length(new.customer_name) > 120 then
    raise exception 'Nama pelanggan harus terdiri dari 2 sampai 120 karakter.'
      using errcode = '22023';
  end if;

  if length(new.customer_email) > 254
    or new.customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Format email tidak valid.'
      using errcode = '22023';
  end if;

  if new.customer_phone !~ '^(\+?62|0)[0-9 -]{8,15}$' then
    raise exception 'Masukkan nomor telepon Indonesia yang valid.'
      using errcode = '22023';
  end if;

  if new.pickup_date < current_date then
    raise exception 'Tanggal ambil tidak boleh berada di masa lalu.'
      using errcode = '22023';
  end if;

  select s.requires_address
  into service_requires_address
  from public.services as s
  where s.name = new.service_name
    and s.active;

  if not found then
    raise exception 'Layanan yang dipilih tidak aktif. Silakan muat ulang halaman dan pilih layanan yang tersedia.'
      using errcode = '23514';
  end if;

  new.pickup_address := nullif(btrim(new.pickup_address), '');

  if service_requires_address and new.pickup_address is null then
    raise exception 'Alamat atau nama lokasi jemput wajib diisi untuk layanan ini.'
      using errcode = '23514';
  end if;

  if not service_requires_address then
    new.pickup_address := null;
  elsif length(new.pickup_address) > 500 then
    raise exception 'Alamat atau nama lokasi jemput maksimal 500 karakter.'
      using errcode = '22001';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_booking_service on public.bookings;
drop function if exists public.validate_booking_service();
drop trigger if exists validate_booking_request on public.bookings;
create trigger validate_booking_request
before insert
on public.bookings
for each row
execute function public.validate_booking_request();
