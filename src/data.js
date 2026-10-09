export const initialCars = [
  { id: 'car-1', name: 'Toyota Avanza Veloz', category: 'MPV', transmission: 'Automatic', seats: 7, price: 450000, quantity: 1, image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1000&q=85', available: true },
  { id: 'car-2', name: 'Honda HR-V SE', category: 'SUV', transmission: 'Automatic', seats: 5, price: 650000, quantity: 1, image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1000&q=85', available: true },
  { id: 'car-3', name: 'Mitsubishi Xpander', category: 'MPV', transmission: 'Automatic', seats: 7, price: 500000, quantity: 1, image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1000&q=85', available: true },
  { id: 'car-4', name: 'Toyota Innova Zenix', category: 'Premium', transmission: 'Automatic', seats: 7, price: 850000, quantity: 1, image: 'https://images.unsplash.com/photo-1617469767053-d3b523a0b982?auto=format&fit=crop&w=1000&q=85', available: true },
]

export const initialServices = [
  { id: 'service-2', name: 'Mobil + sopir', description: 'Perjalanan lebih santai ditemani sopir profesional kami.', icon: 'user-round', active: true, requires_address: false },
  { id: 'service-3', name: 'Antar jemput bandara', description: 'Kami jemput atau antar tepat waktu, tanpa repot.', icon: 'plane', active: true, requires_address: true },
  { id: 'service-4', name: 'Antar jemput stasiun', description: 'Layanan antar jemput dari atau ke stasiun pilihanmu.', icon: 'train-front', active: true, requires_address: true },
]

export function normalizeServices(services) {
  const normalized = services
    .filter((service) => service.id !== 'service-1' && service.name.trim().toLowerCase() !== 'lepas kunci')
    .map((service) => ({
      ...service,
      requires_address: service.requires_address ?? ['service-3', 'service-4'].includes(service.id),
    }))
  const serviceIds = new Set(normalized.map((service) => service.id))
  return [
    ...normalized,
    ...initialServices.filter((service) => !serviceIds.has(service.id)),
  ]
}

export function formatLocalDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function sampleBookings() {
  const today = new Date()
  const date = (offset) => {
    const value = new Date(today)
    value.setDate(value.getDate() + offset)
    return formatLocalDate(value)
  }
  return [
    { id: 'booking-1', customer_name: 'Nadia Putri', customer_email: 'nadia@email.com', customer_phone: '0812 3456 7890', car_id: 'car-1', car_name: 'Toyota Avanza Veloz', service_name: 'Mobil + sopir', pickup_date: date(0), return_date: date(2), total_price: 900000, status: 'confirmed', created_at: new Date().toISOString() },
    { id: 'booking-2', customer_name: 'Rizky Pratama', customer_email: 'rizky@email.com', customer_phone: '0813 7777 2222', car_id: 'car-2', car_name: 'Honda HR-V SE', service_name: 'Mobil + sopir', pickup_date: date(1), return_date: date(3), total_price: 1300000, status: 'pending', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'booking-3', customer_name: 'Dewi Anggraini', customer_email: 'dewi@email.com', customer_phone: '0856 1234 5678', car_id: 'car-3', car_name: 'Mitsubishi Xpander', service_name: 'Mobil + sopir', pickup_date: date(-3), return_date: date(-1), total_price: 1000000, status: 'completed', created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'booking-4', customer_name: 'Fajar Ramadhan', customer_email: 'fajar@email.com', customer_phone: '0821 8888 9999', car_id: 'car-4', car_name: 'Toyota Innova Zenix', service_name: 'Antar jemput bandara', pickup_date: date(5), return_date: date(7), total_price: 1700000, status: 'pending', created_at: new Date(Date.now() - 172800000).toISOString() },
  ]
}
