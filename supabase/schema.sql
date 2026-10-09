create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id text primary key,
  name text not null,
  category text not null,
  transmission text not null default 'Automatic',
  seats integer not null check (seats > 0),
  price integer not null check (price > 0),
  quantity integer not null default 1 check (quantity >= 0),
  image text not null,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null default 'key-round',
  active boolean not null default true,
  requires_address boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id text primary key,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  car_id text not null references public.vehicles (id) on delete restrict,
  car_name text not null,
  service_name text not null,
  pickup_address text,
  pickup_date date not null,
  return_date date not null,
  total_price integer not null check (total_price > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint booking_dates_valid check (return_date >= pickup_date)
);

insert into public.services (id, name, description, icon, requires_address)
values
  ('service-2', 'Mobil + sopir', 'Perjalanan lebih santai ditemani sopir profesional kami.', 'user-round', false),
  ('service-3', 'Antar jemput bandara', 'Kami jemput atau antar tepat waktu, tanpa repot.', 'plane', true),
  ('service-4', 'Antar jemput stasiun', 'Layanan antar jemput dari atau ke stasiun pilihanmu.', 'train-front', true)
on conflict (id) do nothing;

alter table public.admin_users enable row level security;
alter table public.vehicles enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;

create or replace function public.is_rental_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

create policy "Admins can read their own access"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create policy "Public can read available vehicles"
on public.vehicles for select to anon, authenticated
using (available or (select public.is_rental_admin()));
create policy "Admins can manage vehicles"
on public.vehicles for all to authenticated
using ((select public.is_rental_admin()))
with check ((select public.is_rental_admin()));

create policy "Public can read active services"
on public.services for select to anon, authenticated
using (active or (select public.is_rental_admin()));
create policy "Admins can manage services"
on public.services for all to authenticated
using ((select public.is_rental_admin()))
with check ((select public.is_rental_admin()));

create policy "Customers can create pending bookings"
on public.bookings for insert to anon, authenticated
with check (status = 'pending');
create policy "Admins can read bookings"
on public.bookings for select to authenticated
using ((select public.is_rental_admin()));
create policy "Admins can update bookings"
on public.bookings for update to authenticated
using ((select public.is_rental_admin()))
with check ((select public.is_rental_admin()));
create policy "Admins can delete bookings"
on public.bookings for delete to authenticated
using ((select public.is_rental_admin()));

grant select on public.vehicles, public.services to anon, authenticated;
grant insert, update, delete on public.vehicles, public.services to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant insert on public.bookings to anon;
grant select on public.admin_users to authenticated;
