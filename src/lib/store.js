import { computed, ref } from 'vue'
import { defaultHeroImage, formatLocalDate, initialServices, normalizeServices } from '../data'
import { isSupabaseConfigured, supabase } from './supabase'

const isDemo = !isSupabaseConfigured

const readLocal = (key, fallback) => {
  try {
    const stored = localStorage.getItem(`jalanin-${key}`)
    return stored ? JSON.parse(stored) : fallback
  } catch (error) {
    console.error(`Tidak bisa membaca data ${key} dari penyimpanan lokal.`, error)
    return fallback
  }
}

const demoVehicleIds = new Set(['car-1', 'car-2', 'car-3', 'car-4'])
const demoBookingIds = new Set(['booking-1', 'booking-2', 'booking-3', 'booking-4'])
const cars = ref(readLocal('cars', [])
  .filter((car) => !demoVehicleIds.has(car.id))
  .map((car) => ({ quantity: 1, ...car })))
const services = ref(normalizeServices(readLocal('services', initialServices)))
const bookings = ref(readLocal('bookings', []).filter((booking) => !demoBookingIds.has(booking.id)))
const heroImage = ref(readLocal('hero-image', defaultHeroImage))
const driverFeePerDay = ref(readLocal('driver-fee-per-day', 100000))
const availability = ref({})
const busy = ref(false)
const storeError = ref('')

function localAvailability(pickupDate, returnDate) {
  return cars.value.map((car) => {
    const quantity = Number(car.quantity || 0)
    const booked = bookings.value.filter((booking) =>
      booking.car_id === car.id
      && booking.status === 'confirmed'
      && booking.pickup_date <= returnDate
      && booking.return_date >= pickupDate,
    ).length
    return {
      vehicle_id: car.id,
      quantity,
      booked_quantity: booked,
      available_quantity: car.available ? Math.max(0, quantity - booked) : 0,
    }
  })
}

async function getAvailability(pickupDate, returnDate) {
  if (!pickupDate || !returnDate || returnDate < pickupDate) {
    throw new Error('Pilih tanggal sewa yang valid untuk mengecek ketersediaan.')
  }
  if (!isSupabaseConfigured) return localAvailability(pickupDate, returnDate)
  const { data, error } = await supabase.rpc('get_vehicle_availability', {
    p_pickup_date: pickupDate,
    p_return_date: returnDate,
  })
  if (error) throw error
  return data
}

async function refreshAvailability(pickupDate = formatLocalDate(), returnDate = pickupDate) {
  const rows = await getAvailability(pickupDate, returnDate)
  availability.value = Object.fromEntries(rows.map((row) => [row.vehicle_id, row]))
}

function persistLocal(key, value) {
  localStorage.setItem(`jalanin-${key}`, JSON.stringify(value))
}

function publicHeroImageUrl(path, version = Date.now()) {
  const { data } = supabase.storage.from('site-images').getPublicUrl(path)
  return `${data.publicUrl}?v=${encodeURIComponent(version)}`
}

async function refreshHeroImage() {
  if (!isSupabaseConfigured) return heroImage.value

  const { data, error } = await supabase.storage.from('site-images').list('homepage', {
    limit: 10,
    search: 'hero-image',
  })
  if (error) throw error

  const storedImage = data.find((file) => file.name === 'hero-image')
  heroImage.value = storedImage
    ? publicHeroImageUrl(`homepage/${storedImage.name}`, storedImage.updated_at || Date.now())
    : defaultHeroImage
  return heroImage.value
}

async function saveHeroImage(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  const maxSize = isDemo ? 1 : 5
  if (!allowedTypes.includes(file.type)) throw new Error('Format gambar harus JPG, PNG, atau WebP.')
  if (file.size > maxSize * 1024 * 1024) throw new Error(`Ukuran gambar maksimal ${maxSize} MB${isDemo ? ' dalam mode demo' : ''}.`)

  if (isSupabaseConfigured) {
    const { error } = await supabase.storage.from('site-images').upload('homepage/hero-image', file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    })
    if (error) throw error
    heroImage.value = publicHeroImageUrl('homepage/hero-image')
  } else {
    const reader = new FileReader()
    const imageData = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Gambar gagal dibaca. Silakan coba lagi.'))
      reader.readAsDataURL(file)
    })
    heroImage.value = imageData
    persistLocal('hero-image', imageData)
  }

  return heroImage.value
}

async function deleteHeroImage() {
  if (isSupabaseConfigured) {
    const { error } = await supabase.storage.from('site-images').remove(['homepage/hero-image'])
    if (error) throw error
    heroImage.value = defaultHeroImage
  } else {
    heroImage.value = defaultHeroImage
    localStorage.removeItem('jalanin-hero-image')
  }
  return heroImage.value
}

async function refreshRentalPricing() {
  if (!isSupabaseConfigured) return driverFeePerDay.value

  const { data, error } = await supabase
    .from('rental_settings')
    .select('driver_fee_per_day')
    .eq('id', 1)
    .single()
  if (error) throw error
  driverFeePerDay.value = Number(data.driver_fee_per_day)
  return driverFeePerDay.value
}

async function saveDriverFee(value) {
  const fee = Number(value)
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > 2147483647) {
    throw new Error('Biaya sopir harus berupa angka rupiah antara 0 dan 2.147.483.647.')
  }

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('rental_settings')
      .update({ driver_fee_per_day: fee, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('driver_fee_per_day')
      .single()
    if (error) throw error
    driverFeePerDay.value = Number(data.driver_fee_per_day)
  } else {
    driverFeePerDay.value = fee
    persistLocal('driver-fee-per-day', fee)
  }

  return driverFeePerDay.value
}

async function getVehiclePlates(vehicleId) {
  if (!isSupabaseConfigured) {
    const platesByVehicle = readLocal('vehicle-plates', {})
    return platesByVehicle[vehicleId] || []
  }

  const { data, error } = await supabase
    .from('vehicle_units')
    .select('license_plate')
    .eq('vehicle_id', vehicleId)
    .order('license_plate')
  if (error) throw error
  return data.map((unit) => unit.license_plate)
}

async function confirmBookingWithUnit(booking, licensePlate) {
  if (!licensePlate) throw new Error('Pilih nomor polisi unit yang akan digunakan.')

  let updatedBooking
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('confirm_booking_with_unit', {
      p_booking_id: booking.id,
      p_license_plate: licensePlate,
    })
    if (error) throw error
    updatedBooking = { ...booking, ...data }
  } else {
    updatedBooking = {
      ...booking,
      status: 'confirmed',
      assigned_license_plate: licensePlate,
    }
    persistLocal('bookings', bookings.value.map((item) =>
      item.id === booking.id ? updatedBooking : item,
    ))
  }

  bookings.value = bookings.value.map((item) =>
    item.id === booking.id ? updatedBooking : item,
  )
  return updatedBooking
}

async function saveCarWithPlates(record, licensePlates) {
  const plates = licensePlates.map((plate) => plate.trim().toUpperCase())
  const { license_plates: _licensePlates, ...vehicleRecord } = record
  if (plates.length !== Number(record.quantity)) {
    throw new Error(`Jumlah nomor polisi harus sama dengan jumlah unit (${record.quantity}).`)
  }
  if (plates.some((plate) => !plate || plate.length > 20)) {
    throw new Error('Isi nomor polisi untuk setiap unit mobil (maksimal 20 karakter).')
  }
  if (new Set(plates).size !== plates.length) {
    throw new Error('Nomor polisi untuk setiap unit harus berbeda.')
  }

  let vehicleSaved = false
  try {
    await saveRecord(cars, 'vehicles', vehicleRecord)
    vehicleSaved = true

    if (!isSupabaseConfigured) {
      const platesByVehicle = readLocal('vehicle-plates', {})
      platesByVehicle[vehicleRecord.id] = plates
      persistLocal('vehicle-plates', platesByVehicle)
      return vehicleRecord
    }

    const { error } = await supabase.rpc('save_vehicle_units', {
      p_vehicle_id: vehicleRecord.id,
      p_license_plates: plates,
    })
    if (error) {
      if (error.code === '23505') {
        throw new Error(`Data mobil tersimpan, tetapi nomor polisi sudah digunakan: ${error.message}`)
      }
      throw new Error(`Data mobil tersimpan, tetapi nomor polisi gagal diperbarui: ${error.message}`)
    }

    return vehicleRecord
  } catch (error) {
    if (vehicleSaved && error instanceof Error) error.vehicleSaved = true
    throw error
  }
}

async function loadCollection(table, fallback) {
  if (!isSupabaseConfigured) return fallback
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

async function refresh({ includeBookings = true, pickupDate = formatLocalDate(), returnDate = pickupDate } = {}) {
  busy.value = true
  storeError.value = ''
  try {
    const collections = [
      loadCollection('vehicles', cars.value),
      loadCollection('services', services.value),
    ]
    if (includeBookings) collections.push(loadCollection('bookings', bookings.value))
    const [nextCars, nextServices, nextBookings] = await Promise.all(collections)
    cars.value = nextCars.map((car) => ({ quantity: 1, ...car }))
    services.value = nextServices
    if (includeBookings) bookings.value = nextBookings
    await refreshAvailability(pickupDate, returnDate)
    if (!isSupabaseConfigured) {
      persistLocal('cars', cars.value)
      persistLocal('services', services.value)
      persistLocal('bookings', bookings.value)
    }
  } catch (error) {
    storeError.value = error.message || 'Data gagal dimuat.'
    throw error
  } finally {
    busy.value = false
  }
}

async function saveRecord(collection, table, record) {
  storeError.value = ''
  try {
    if (table === 'bookings' && !collection.value.some((item) => item.id === record.id)) {
      const duplicate = collection.value.some((item) =>
        ['pending', 'confirmed'].includes(item.status)
        && item.car_id === record.car_id
        && item.pickup_date === record.pickup_date
        && item.return_date === record.return_date
        && item.customer_email?.trim().toLowerCase() === record.customer_email?.trim().toLowerCase(),
      )
      if (duplicate) {
        const error = new Error('Booking dengan email, mobil, dan tanggal tersebut sudah pernah dikirim.')
        error.code = '23505'
        throw error
      }
    }
    if (isSupabaseConfigured) {
      const exists = collection.value.some((item) => item.id === record.id)
      if (table === 'bookings' && !exists) {
        const { error } = await supabase.from(table).insert(record)
        if (error) throw error
      } else if (exists) {
        const { data, error } = await supabase.from(table).update(record).eq('id', record.id).select().single()
        if (error) throw error
        record = data
      } else {
        const { data, error } = await supabase.from(table).insert(record).select().single()
        if (error) throw error
        record = data
      }
    }
    const rows = collection.value
    const index = rows.findIndex((item) => item.id === record.id)
    collection.value = index === -1 ? [record, ...rows] : rows.map((item) => item.id === record.id ? record : item)
    if (!isSupabaseConfigured) persistLocal(table === 'vehicles' ? 'cars' : table, collection.value)
    return record
  } catch (error) {
    storeError.value = error.message || 'Perubahan gagal disimpan.'
    throw error
  }
}

async function deleteRecord(collection, table, id, localKey) {
  storeError.value = ''
  try {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    }
    collection.value = collection.value.filter((item) => item.id !== id)
    if (!isSupabaseConfigured) persistLocal(localKey, collection.value)
  } catch (error) {
    storeError.value = error.message || 'Data gagal dihapus.'
    throw error
  }
}

export const useStore = () => ({
  cars,
  services,
  bookings,
  availability,
  busy,
  storeError,
  isDemo,
  availableCars: computed(() => cars.value.filter((car) => car.available)),
  heroImage,
  driverFeePerDay,
  getAvailability,
  refreshAvailability,
  refreshRentalPricing,
  saveDriverFee,
  getVehiclePlates,
  confirmBookingWithUnit,
  saveCarWithPlates,
  refreshHeroImage,
  saveHeroImage,
  deleteHeroImage,
  refresh,
  saveCar: (record) => saveRecord(cars, 'vehicles', record),
  saveService: (record) => saveRecord(services, 'services', record),
  saveBooking: (record) => saveRecord(bookings, 'bookings', record),
  deleteCar: (id) => deleteRecord(cars, 'vehicles', id, 'cars'),
  deleteService: (id) => deleteRecord(services, 'services', id, 'services'),
  deleteBooking: (id) => deleteRecord(bookings, 'bookings', id, 'bookings'),
})
