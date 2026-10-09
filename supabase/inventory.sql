-- Jalankan sekali setelah schema.sql pada proyek Supabase yang sudah ada.
alter table public.vehicles
  add column if not exists quantity integer not null default 1
  check (quantity >= 0);

create or replace function public.get_vehicle_availability(
  p_pickup_date date,
  p_return_date date
)
returns table (
  vehicle_id text,
  quantity integer,
  booked_quantity bigint,
  available_quantity bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_pickup_date is null or p_return_date is null or p_return_date < p_pickup_date then
    raise exception 'Rentang tanggal booking tidak valid.'
      using errcode = '22023';
  end if;

  return query
  select
    v.id,
    v.quantity,
    count(b.id) filter (where b.id is not null)::bigint,
    greatest(v.quantity - count(b.id) filter (where b.id is not null), 0)::bigint
  from public.vehicles as v
  left join public.bookings as b
    on b.car_id = v.id
    and b.status = 'confirmed'
    and b.pickup_date <= p_return_date
    and b.return_date >= p_pickup_date
  where v.available
  group by v.id, v.quantity;
end;
$$;

revoke all on function public.get_vehicle_availability(date, date) from public;
grant execute on function public.get_vehicle_availability(date, date) to anon, authenticated;

create or replace function public.prevent_vehicle_overbooking()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  vehicle_quantity integer;
  peak_existing_bookings bigint;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'confirmed'
    and old.car_id = new.car_id
    and old.pickup_date = new.pickup_date
    and old.return_date = new.return_date then
    return new;
  end if;

  select v.quantity
  into vehicle_quantity
  from public.vehicles as v
  where v.id = new.car_id
  for update;

  if not found then
    raise exception 'Mobil untuk booking ini tidak ditemukan.'
      using errcode = '23503';
  end if;

  select coalesce(max((
    select count(*)
    from public.bookings as b
    where b.car_id = new.car_id
      and b.status = 'confirmed'
      and b.id <> new.id
      and b.pickup_date <= candidate_date.rental_date
      and b.return_date >= candidate_date.rental_date
  )), 0)
  into peak_existing_bookings
  from (
    select new.pickup_date as rental_date
    union
    select b.pickup_date
    from public.bookings as b
    where b.car_id = new.car_id
      and b.status = 'confirmed'
      and b.id <> new.id
      and b.pickup_date between new.pickup_date and new.return_date
  ) as candidate_date;

  if peak_existing_bookings >= vehicle_quantity then
    raise exception 'Stok mobil tidak cukup untuk rentang tanggal ini. Ubah tanggal atau jumlah armada terlebih dahulu.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_vehicle_overbooking on public.bookings;
create trigger prevent_vehicle_overbooking
before insert or update of status, car_id, pickup_date, return_date
on public.bookings
for each row
execute function public.prevent_vehicle_overbooking();

create or replace function public.prevent_quantity_below_confirmed_bookings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity = old.quantity then
    return new;
  end if;

  if exists (
    select 1
    from public.bookings as candidate
    where candidate.car_id = new.id
      and candidate.status = 'confirmed'
      and candidate.return_date >= current_date
      and (
        select count(*)
        from public.bookings as overlapping
        where overlapping.car_id = new.id
          and overlapping.status = 'confirmed'
          and overlapping.pickup_date <= candidate.pickup_date
          and overlapping.return_date >= candidate.pickup_date
      ) > new.quantity
  ) then
    raise exception 'Jumlah unit tidak boleh lebih kecil dari booking yang sudah dikonfirmasi pada tanggal yang bertumpang tindih.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_quantity_below_confirmed_bookings on public.vehicles;
create trigger prevent_quantity_below_confirmed_bookings
before update of quantity
on public.vehicles
for each row
execute function public.prevent_quantity_below_confirmed_bookings();
