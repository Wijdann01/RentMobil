-- Run once after fleet-pricing.sql to assign a specific vehicle unit to bookings.

alter table public.bookings
  add column if not exists assigned_license_plate text
  references public.vehicle_units (license_plate);

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

create or replace function public.confirm_booking_with_unit(
  p_booking_id text,
  p_license_plate text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
begin
  if not (select public.is_rental_admin()) then
    raise exception 'Akses admin diperlukan untuk menetapkan unit booking.'
      using errcode = '42501';
  end if;

  select b.*
  into target_booking
  from public.bookings as b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking tidak ditemukan.' using errcode = 'P0002';
  end if;

  if target_booking.status not in ('pending', 'confirmed') then
    raise exception 'Hanya booking menunggu atau terkonfirmasi yang dapat diberi unit.'
      using errcode = '22023';
  end if;

  perform v.id
  from public.vehicles as v
  where v.id = target_booking.car_id
  for update;

  if not found then
    raise exception 'Mobil booking tidak ditemukan.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.vehicle_units as unit
    where unit.license_plate = p_license_plate
      and unit.vehicle_id = target_booking.car_id
  ) then
    raise exception 'Nomor polisi tidak terdaftar untuk mobil booking ini.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.bookings as other_booking
    where other_booking.id <> target_booking.id
      and other_booking.status = 'confirmed'
      and other_booking.assigned_license_plate = p_license_plate
      and other_booking.pickup_date <= target_booking.return_date
      and other_booking.return_date >= target_booking.pickup_date
  ) then
    raise exception 'Unit dengan nomor polisi tersebut sudah dipakai pada periode yang bertabrakan.'
      using errcode = '23P01';
  end if;

  update public.bookings
  set status = 'confirmed',
      assigned_license_plate = p_license_plate
  where id = target_booking.id;

  return pg_catalog.jsonb_build_object(
    'id', target_booking.id,
    'status', 'confirmed',
    'assigned_license_plate', p_license_plate
  );
end;
$$;

revoke all on function public.confirm_booking_with_unit(text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_booking_with_unit(text, text)
  to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;
