-- Adds a private rate-limit store and server-only booking RPC.
-- Existing vehicles, services, and bookings table structures are unchanged.

create table if not exists public.booking_rate_limits (
  scope text not null check (scope in ('ip', 'email')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hit_count integer not null check (hit_count > 0),
  primary key (scope, subject_hash, window_start)
);

alter table public.booking_rate_limits enable row level security;
revoke all on public.booking_rate_limits from public, anon, authenticated;
grant all on public.booking_rate_limits to service_role;

revoke insert on table public.bookings from public, anon, authenticated;
drop policy if exists "Customers can create pending bookings" on public.bookings;

create or replace function public.consume_booking_rate_limit(
  p_ip_hash text,
  p_email_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_hits integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate limit key.' using errcode = '22023';
  end if;

  current_window := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()) / 600) * 600
  );

  delete from public.booking_rate_limits
  where window_start < current_window - interval '2 hours';

  insert into public.booking_rate_limits as limits (scope, subject_hash, window_start, hit_count)
  values ('ip', p_ip_hash, current_window, 1)
  on conflict (scope, subject_hash, window_start)
  do update set hit_count = limits.hit_count + 1
  where limits.hit_count < 10
  returning hit_count into current_hits;

  if not found then
    return false;
  end if;

  insert into public.booking_rate_limits as limits (scope, subject_hash, window_start, hit_count)
  values ('email', p_email_hash, current_window, 1)
  on conflict (scope, subject_hash, window_start)
  do update set hit_count = limits.hit_count + 1
  where limits.hit_count < 3
  returning hit_count into current_hits;

  return found;
end;
$$;

revoke all on function public.consume_booking_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_booking_rate_limit(text, text) to service_role;

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

  rental_days := greatest(p_return_date - p_pickup_date, 1);
  booking_total := selected_vehicle.price::bigint * rental_days;

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
    'total_price', booking_total::integer
  );
end;
$$;

revoke all on function public.create_public_booking(text, text, text, text, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.create_public_booking(text, text, text, text, text, date, date, text)
  to service_role;
