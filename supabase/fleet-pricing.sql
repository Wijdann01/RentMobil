-- Jalankan sekali setelah public-booking.sql.
-- Menyimpan nomor polisi secara terpisah agar tidak terbuka pada katalog publik.

create table if not exists public.vehicle_units (
  license_plate text primary key check (license_plate = upper(btrim(license_plate))),
  vehicle_id text not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.vehicle_units enable row level security;
drop policy if exists "Admins can manage vehicle units" on public.vehicle_units;
create policy "Admins can manage vehicle units"
on public.vehicle_units for all to authenticated
using ((select public.is_rental_admin()))
with check ((select public.is_rental_admin()));

revoke all on public.vehicle_units from public, anon, authenticated;
grant select, insert, delete on public.vehicle_units to authenticated;

create or replace function public.save_vehicle_units(
  p_vehicle_id text,
  p_license_plates text[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  vehicle_quantity integer;
  submitted_count integer;
  distinct_count integer;
begin
  select v.quantity
  into vehicle_quantity
  from public.vehicles as v
  where v.id = p_vehicle_id;

  if not found then
    raise exception 'Mobil tidak ditemukan atau akses tidak diizinkan.'
      using errcode = 'P0002';
  end if;

  submitted_count := coalesce(pg_catalog.cardinality(p_license_plates), 0);
  if submitted_count <> vehicle_quantity then
    raise exception 'Jumlah nomor polisi harus sama dengan jumlah unit mobil.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_license_plates) as plates(license_plate)
    where plates.license_plate is null
      or plates.license_plate <> pg_catalog.upper(pg_catalog.btrim(plates.license_plate))
      or pg_catalog.length(plates.license_plate) = 0
      or pg_catalog.length(plates.license_plate) > 20
  ) then
    raise exception 'Nomor polisi harus terisi, maksimal 20 karakter, dan menggunakan huruf kapital.'
      using errcode = '22023';
  end if;

  select count(distinct plates.license_plate)::integer
  into distinct_count
  from pg_catalog.unnest(p_license_plates) as plates(license_plate);
  if distinct_count <> submitted_count then
    raise exception 'Nomor polisi untuk setiap unit harus berbeda.'
      using errcode = '22023';
  end if;

  delete from public.vehicle_units
  where vehicle_id = p_vehicle_id
    and not (
      license_plate = any(coalesce(p_license_plates, array[]::text[]))
    );

  insert into public.vehicle_units (license_plate, vehicle_id)
  select plates.license_plate, p_vehicle_id
  from pg_catalog.unnest(p_license_plates) as plates(license_plate)
  where not exists (
    select 1
    from public.vehicle_units as current_unit
    where current_unit.license_plate = plates.license_plate
  );
end;
$$;

revoke all on function public.save_vehicle_units(text, text[]) from public, anon, authenticated;
grant execute on function public.save_vehicle_units(text, text[]) to authenticated;

create table if not exists public.rental_settings (
  id smallint primary key check (id = 1),
  driver_fee_per_day integer not null check (driver_fee_per_day >= 0),
  updated_at timestamptz not null default now()
);

insert into public.rental_settings (id, driver_fee_per_day)
values (1, 100000)
on conflict (id) do nothing;

alter table public.rental_settings enable row level security;
drop policy if exists "Anyone can read rental pricing" on public.rental_settings;
create policy "Anyone can read rental pricing"
on public.rental_settings for select to anon, authenticated
using (true);

drop policy if exists "Admins can update rental pricing" on public.rental_settings;
create policy "Admins can update rental pricing"
on public.rental_settings for update to authenticated
using ((select public.is_rental_admin()))
with check ((select public.is_rental_admin()));

revoke all on public.rental_settings from public, anon, authenticated;
grant select on public.rental_settings to anon, authenticated;
grant update on public.rental_settings to authenticated;

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

  if new.pickup_address is not null and length(new.pickup_address) > 500 then
    raise exception 'Alamat atau nama lokasi jemput maksimal 500 karakter.'
      using errcode = '22001';
  end if;

  return new;
end;
$$;

create or replace function public.create_public_booking(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_car_id text,
  p_service_name text,
  p_pickup_date date,
  p_return_date date,
  p_pickup_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_vehicle public.vehicles%rowtype;
  selected_service public.services%rowtype;
  rental_days integer;
  driver_fee integer;
  vehicle_total bigint;
  driver_total bigint;
  booking_total bigint;
  new_booking_id text;
begin
  if p_pickup_date is null or p_return_date is null or p_return_date < p_pickup_date then
    raise exception 'Tanggal sewa tidak valid.' using errcode = '22023';
  end if;

  if p_pickup_date < current_date then
    raise exception 'Tanggal ambil tidak boleh berada di masa lalu.' using errcode = '22023';
  end if;

  select v.*
  into selected_vehicle
  from public.vehicles as v
  where v.id = p_car_id
    and v.available;

  if not found then
    raise exception 'Mobil yang dipilih tidak tersedia.' using errcode = 'P0001';
  end if;

  select s.*
  into selected_service
  from public.services as s
  where s.name = p_service_name
    and s.active;

  if not found then
    raise exception 'Layanan yang dipilih tidak aktif.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.get_vehicle_availability(p_pickup_date, p_return_date) as availability
    where availability.vehicle_id = selected_vehicle.id
      and availability.available_quantity > 0
  ) then
    raise exception 'Mobil tidak tersedia pada tanggal tersebut.' using errcode = 'P0001';
  end if;

  select settings.driver_fee_per_day
  into driver_fee
  from public.rental_settings as settings
  where settings.id = 1;

  if not found then
    raise exception 'Pengaturan biaya sopir belum tersedia.' using errcode = '55000';
  end if;

  rental_days := greatest(p_return_date - p_pickup_date, 1);
  vehicle_total := selected_vehicle.price::bigint * rental_days;
  driver_total := driver_fee::bigint * rental_days;
  booking_total := vehicle_total + driver_total;

  if booking_total > 2147483647 then
    raise exception 'Total harga melebihi batas yang dapat diproses.' using errcode = '22003';
  end if;

  new_booking_id := pg_catalog.gen_random_uuid()::text;

  insert into public.bookings (
    id,
    customer_name,
    customer_email,
    customer_phone,
    car_id,
    car_name,
    service_name,
    pickup_address,
    pickup_date,
    return_date,
    total_price,
    status
  )
  values (
    new_booking_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    selected_vehicle.id,
    selected_vehicle.name,
    selected_service.name,
    p_pickup_address,
    p_pickup_date,
    p_return_date,
    booking_total::integer,
    'pending'
  );

  return pg_catalog.jsonb_build_object(
    'id', new_booking_id,
    'rental_days', rental_days,
    'vehicle_price_per_day', selected_vehicle.price,
    'vehicle_total', vehicle_total,
    'driver_fee_per_day', driver_fee,
    'driver_total', driver_total,
    'total_price', booking_total
  );
end;
$$;

revoke all on function public.create_public_booking(text, text, text, text, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.create_public_booking(text, text, text, text, text, date, date, text)
  to service_role;
