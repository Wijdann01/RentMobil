-- Jalankan sekali untuk membersihkan armada contoh dari instalasi lama.
-- Mobil yang sudah dirujuk booking dipertahankan untuk menjaga riwayat, tetapi dinonaktifkan.

update public.vehicles as vehicle
set available = false
where (vehicle.id, vehicle.name) in (
  ('car-1', 'Toyota Avanza Veloz'),
  ('car-2', 'Honda HR-V SE'),
  ('car-3', 'Mitsubishi Xpander'),
  ('car-4', 'Toyota Innova Zenix')
)
and exists (
  select 1
  from public.bookings as booking
  where booking.car_id = vehicle.id
);

delete from public.vehicles as vehicle
where (vehicle.id, vehicle.name) in (
  ('car-1', 'Toyota Avanza Veloz'),
  ('car-2', 'Honda HR-V SE'),
  ('car-3', 'Mitsubishi Xpander'),
  ('car-4', 'Toyota Innova Zenix')
)
and not exists (
  select 1
  from public.bookings as booking
  where booking.car_id = vehicle.id
);
