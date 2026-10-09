export const initialServices = [
  { id: 'service-2', name: 'Mobil + sopir', description: 'Perjalanan lebih santai ditemani sopir profesional kami.', icon: 'user-round', active: true, requires_address: false },
  { id: 'service-3', name: 'Antar jemput bandara', description: 'Kami jemput atau antar tepat waktu, tanpa repot.', icon: 'plane', active: true, requires_address: true },
  { id: 'service-4', name: 'Antar jemput stasiun', description: 'Layanan antar jemput dari atau ke stasiun pilihanmu.', icon: 'train-front', active: true, requires_address: true },
]

export const defaultHeroImage = 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1500&q=90'

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
