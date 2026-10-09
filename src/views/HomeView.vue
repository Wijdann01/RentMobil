<script setup>
import { ArrowRight, ArrowUpRight, Check, ChevronDown, CircleCheck, Clock3, Fuel, MapPin, MessageCircle, MoveRight, ShieldCheck, TrainFront, Users, WalletCards } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { formatLocalDate } from '../data'
import TurnstileWidget from '../components/TurnstileWidget.vue'
import { useStore } from '../lib/store'

const { availableCars, availability, services, heroImage, saveBooking, getAvailability, refresh, refreshHeroImage, isDemo } = useStore()
const selectedCategory = ref('Semua')
const bookingCar = ref(null)
const submitting = ref(false)
const captchaToken = ref('')
const captchaError = ref('')
const captchaWidgetKey = ref(0)
const checkingAvailability = ref(false)
const notice = ref('')
const bookingError = ref('')
const availabilityError = ref('')
const bookingAvailability = ref(null)
const form = ref({ name: '', email: '', phone: '', pickup: '', return: '', service: 'Mobil + sopir', pickupAddress: '' })
const selectedService = computed(() => services.value.find((service) => service.name === form.value.service && service.active))
const requiresAddress = computed(() => Boolean(selectedService.value?.requires_address))
watch(requiresAddress, (value) => {
  if (!value) form.value.pickupAddress = ''
})
const categories = ['Semua', 'MPV', 'SUV', 'Premium']
const visibleCars = computed(() => selectedCategory.value === 'Semua' ? availableCars.value : availableCars.value.filter((car) => car.category === selectedCategory.value))
const formatPrice = (value) => new Intl.NumberFormat('id-ID').format(value)
const today = formatLocalDate()
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

onMounted(() => {
  refresh({ includeBookings: false, pickupDate: today, returnDate: today })
    .catch((error) => console.error('Gagal memuat katalog mobil.', error))
  refreshHeroImage().catch((error) => console.error('Gagal memuat gambar hero website.', error))
})

function openBooking(car) {
  bookingCar.value = car
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  form.value = {
    name: '',
    email: '',
    phone: '',
    pickup: today,
    return: formatLocalDate(tomorrow),
    service: services.value.find((service) => service.active)?.name || '',
    pickupAddress: '',
  }
  bookingError.value = ''
  captchaToken.value = ''
  captchaError.value = ''
  notice.value = ''
  availabilityError.value = ''
  bookingAvailability.value = null
}

let availabilityRequest = 0
watch(
  () => [bookingCar.value?.id, form.value.pickup, form.value.return],
  async ([carId, pickupDate, returnDate]) => {
    const request = ++availabilityRequest
    bookingAvailability.value = null
    availabilityError.value = ''
    checkingAvailability.value = false
    if (!carId || !pickupDate || !returnDate || returnDate < pickupDate) return
    checkingAvailability.value = true
    try {
      const rows = await getAvailability(pickupDate, returnDate)
      if (request === availabilityRequest) {
        bookingAvailability.value = rows.find((row) => row.vehicle_id === carId) || null
      }
    } catch (error) {
      if (request === availabilityRequest) availabilityError.value = error.message || 'Ketersediaan mobil gagal diperiksa.'
    } finally {
      if (request === availabilityRequest) checkingAvailability.value = false
    }
  },
)

async function submitBooking() {
  if (submitting.value) return
  if (new Date(form.value.return) < new Date(form.value.pickup)) {
    bookingError.value = 'Tanggal pengembalian harus setelah tanggal penjemputan.'
    return
  }
  if (!selectedService.value) {
    bookingError.value = 'Pilih layanan yang masih tersedia.'
    return
  }
  if (requiresAddress.value && !form.value.pickupAddress.trim()) {
    bookingError.value = 'Alamat atau nama lokasi antar jemput wajib diisi untuk layanan ini.'
    return
  }
  if (!isDemo && !turnstileSiteKey) {
    bookingError.value = 'Verifikasi keamanan belum dikonfigurasi. Hubungi pengelola website.'
    return
  }
  if (!isDemo && !captchaToken.value) {
    bookingError.value = 'Selesaikan verifikasi keamanan sebelum mengirim booking.'
    return
  }
  submitting.value = true
  bookingError.value = ''
  try {
    const rows = await getAvailability(form.value.pickup, form.value.return)
    const selectedAvailability = rows.find((row) => row.vehicle_id === bookingCar.value.id)
    if (!selectedAvailability || selectedAvailability.available_quantity < 1) {
      throw new Error('Mobil tidak tersedia pada tanggal tersebut. Silakan pilih tanggal lain.')
    }
    const bookingRequest = {
      customer_name: form.value.name,
      customer_email: form.value.email,
      customer_phone: form.value.phone,
      car_id: bookingCar.value.id,
      service_name: form.value.service,
      pickup_date: form.value.pickup,
      return_date: form.value.return,
      pickup_address: requiresAddress.value ? form.value.pickupAddress.trim() : null,
    }
    if (isDemo) {
      const days = Math.max(1, Math.round(
        (Date.parse(`${form.value.return}T00:00:00Z`) - Date.parse(`${form.value.pickup}T00:00:00Z`)) / 86400000,
      ))
      await saveBooking({
        ...bookingRequest,
        id: crypto.randomUUID(),
        car_name: bookingCar.value.name,
        total_price: bookingCar.value.price * days,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
    } else {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bookingRequest, captcha_token: captchaToken.value }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Booking gagal dikirim. Coba lagi.')
    }
    notice.value = 'Booking terkirim! Mohon konfirmasi kembali dengan Customer Service.'
    bookingCar.value = null
  } catch (error) {
    bookingError.value = error.code === '23505'
      ? 'Booking dengan email, mobil, dan tanggal tersebut sudah pernah dikirim.'
      : error.message || 'Booking gagal dikirim. Coba lagi.'
  } finally {
    submitting.value = false
    captchaToken.value = ''
    if (!isDemo) captchaWidgetKey.value += 1
  }
}
</script>

<template>
  <main>
    <section class="container-wide grid min-h-[590px] items-center gap-10 pb-12 pt-10 lg:grid-cols-[.88fr_1.12fr] lg:pb-16 lg:pt-12">
      <div class="relative z-10 py-5">
        <div class="mb-7 inline-flex items-center gap-2 rounded-full border border-[#e6eae3] bg-white px-3.5 py-2 text-xs font-semibold text-[#52685a]">
          <span class="h-2 w-2 rounded-full bg-[#75a17d]"></span> Teman perjalanan yang bisa diandalkan
        </div>
        <h1 class="font-display max-w-[590px] text-[clamp(42px,6vw,72px)] font-extrabold leading-[1.08] tracking-[-3.8px] text-[#23362d]">
          Jalan-jalan <span class="text-[#85a487]">tanpa</span><br />banyak drama.
        </h1>
        <p class="mt-6 max-w-[460px] text-[16px] leading-7 text-[#727c74]">Butuh mobil untuk liburan, kerja, atau jemput orang tersayang? Pilih mobilnya, tentukan tanggalnya, sisanya biar kami yang urus.</p>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <a href="#armada" class="inline-flex items-center gap-2 rounded-full bg-[#244b3b] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#18392c]">Cari mobil <ArrowRight :size="17" /></a>
          <a href="#layanan" class="rounded-full px-5 py-3.5 text-sm font-semibold text-[#52685a] transition hover:bg-[#ecefe8]">Kenali layanan kami</a>
        </div>
        <div class="mt-11 flex items-center gap-5">
          <div class="flex -space-x-2.5">
            <div v-for="(person, index) in ['NP', 'RA', 'DA', 'FS']" :key="person" class="flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-[#f8f8f5] text-[10px] font-bold text-white" :class="['bg-[#859b7d]', 'bg-[#cf9f78]', 'bg-[#698377]', 'bg-[#c67c69]'][index]">{{ person }}</div>
          </div>
          <div><p class="text-sm font-bold text-[#34453a]">Dipercaya banyak orang</p><p class="mt-0.5 text-xs text-[#858d85]">4.9/5 dari 200+ pelanggan</p></div>
        </div>
      </div>
      <div class="relative min-h-[360px] lg:h-[480px]">
        <div class="absolute inset-0 overflow-hidden rounded-[30px] bg-[#dbe2d8]">
          <img class="h-full w-full object-cover" :src="heroImage" alt="Mobil siap menemani perjalanan" />
          <div class="absolute inset-0 bg-gradient-to-t from-[#20362d]/30 via-transparent to-transparent"></div>
        </div>
        <div class="soft-shadow absolute bottom-5 left-5 flex items-center gap-3 rounded-2xl bg-white/95 p-4 backdrop-blur sm:bottom-7 sm:left-7">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2eb] text-[#52745b]"><ShieldCheck :size="23" /></span>
          <div><p class="text-sm font-bold text-[#2f4437]">Semua mobil terawat</p><p class="mt-1 text-xs text-[#7e8980]">Diperiksa sebelum perjalanan</p></div>
        </div>
        <div class="absolute right-5 top-5 rounded-2xl bg-white/95 px-4 py-3.5 backdrop-blur sm:right-7 sm:top-7">
          <div class="mb-1 flex gap-0.5 text-[#dca74a]"><span v-for="i in 5" :key="i">★</span></div>
          <p class="text-xs font-semibold text-[#536258]">Perjalanan makin tenang</p>
        </div>
      </div>
    </section>

    <section class="container-wide -mt-1 pb-14">
      <div class="grid gap-3 rounded-[22px] border border-[#e8eae5] bg-white p-3 sm:grid-cols-3 sm:p-4">
        <div class="flex items-center gap-3 rounded-xl px-3 py-2"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4ef] text-[#607b64]"><WalletCards :size="19" /></span><div><p class="text-xs text-[#8a938b]">Harga jujur, dari awal</p><p class="mt-1 text-sm font-semibold text-[#39483d]">Tanpa biaya tersembunyi</p></div></div>
        <div class="flex items-center gap-3 rounded-xl px-3 py-2"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4ef] text-[#607b64]"><Clock3 :size="19" /></span><div><p class="text-xs text-[#8a938b]">Booking cepat</p><p class="mt-1 text-sm font-semibold text-[#39483d]">Konfirmasi dalam 1 jam</p></div></div>
        <div class="flex items-center gap-3 rounded-xl px-3 py-2"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f4ef] text-[#607b64]"><CircleCheck :size="19" /></span><div><p class="text-xs text-[#8a938b]">Fleksibel pilih layanan</p><p class="mt-1 text-sm font-semibold text-[#39483d]">Pakai sopir atau sendiri</p></div></div>
      </div>
    </section>

    <section id="armada" class="scroll-mt-6 bg-[#f0f1ec] py-20 sm:py-24">
      <div class="container-wide">
        <div class="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div><p class="mb-3 text-xs font-bold uppercase tracking-[2px] text-[#79917b]">Temukan teman jalanmu</p><h2 class="font-display text-3xl font-extrabold tracking-[-1.5px] text-[#263a30] sm:text-[40px]">Armada pilihan</h2><p class="mt-3 text-sm text-[#7a857d]">Bersih, nyaman, dan siap berangkat kapan saja.</p></div>
          <div class="flex flex-wrap gap-2">
            <button v-for="category in categories" :key="category" class="rounded-full px-4 py-2.5 text-xs font-semibold transition" :class="selectedCategory === category ? 'bg-[#244b3b] text-white' : 'bg-white text-[#738077] hover:bg-[#e6eae3]'" @click="selectedCategory = category">{{ category }}</button>
          </div>
        </div>
        <div v-if="visibleCars.length" class="mt-9 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <article v-for="car in visibleCars" :key="car.id" class="group overflow-hidden rounded-[20px] border border-[#e9ebe5] bg-white transition duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div class="relative h-[190px] overflow-hidden bg-[#e6e8e1]">
              <img class="h-full w-full object-cover transition duration-500 group-hover:scale-105" :src="car.image" :alt="car.name" />
              <span class="absolute left-3.5 top-3.5 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-[#52685a] backdrop-blur">{{ car.category }}</span>
              <span class="absolute bottom-3.5 left-3.5 rounded-full px-3 py-1.5 text-[10px] font-bold backdrop-blur" :class="(availability[car.id]?.available_quantity ?? car.quantity) > 0 ? 'bg-white/90 text-[#52685a]' : 'bg-[#fff1e8]/95 text-[#a75d42]'">{{ availability[car.id]?.available_quantity ?? car.quantity }} / {{ availability[car.id]?.quantity ?? car.quantity }} unit tersedia hari ini</span>
              <button class="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#637269]" :aria-label="`Lihat ${car.name}`"><ArrowUpRight :size="15" /></button>
            </div>
            <div class="p-4">
              <h3 class="font-display text-[16px] font-bold text-[#2d3d32]">{{ car.name }}</h3>
              <div class="mt-3 flex items-center gap-3 text-[11px] text-[#838d84]"><span class="flex items-center gap-1"><Users :size="13" /> {{ car.seats }} kursi</span><span class="h-1 w-1 rounded-full bg-[#c6ccc4]"></span><span>{{ car.transmission }}</span><span class="h-1 w-1 rounded-full bg-[#c6ccc4]"></span><span class="flex items-center gap-1"><Fuel :size="13" /> Bensin</span></div>
              <div class="mt-4 flex items-end justify-between border-t border-[#f0f1ed] pt-4">
                <div><p class="text-[10px] text-[#919990]">Mulai dari</p><p class="mt-0.5 text-[15px] font-bold text-[#355a43]">Rp{{ formatPrice(car.price) }}<span class="text-[10px] font-medium text-[#89938a]"> / hari</span></p></div>
                <button class="rounded-full bg-[#edf2ec] px-3.5 py-2 text-[11px] font-bold text-[#44664d] transition hover:bg-[#244b3b] hover:text-white" @click="openBooking(car)">Pilih tanggal</button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="mt-9 rounded-2xl bg-white p-10 text-center text-sm text-[#758078]">Belum ada mobil untuk kategori ini.</div>
        <p class="mt-5 text-center text-xs text-[#90988e]">Harga belum termasuk bahan bakar, tol, dan biaya parkir.</p>
      </div>
    </section>

    <section id="layanan" class="scroll-mt-6 py-20 sm:py-24">
      <div class="container-wide grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
        <div>
          <p class="mb-3 text-xs font-bold uppercase tracking-[2px] text-[#79917b]">Layanan yang bikin nyaman</p>
          <h2 class="font-display text-3xl font-extrabold leading-tight tracking-[-1.5px] text-[#263a30] sm:text-[40px]">Berangkat dengan caramu sendiri.</h2>
          <p class="mt-4 max-w-[440px] text-sm leading-7 text-[#78837a]">Rencana setiap orang berbeda. Makanya kami siapkan pilihan layanan yang bisa disesuaikan dengan perjalananmu.</p>
          <a href="https://wa.me/6282217492009" class="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#46674f]">Tanya-tanya dulu juga boleh <MoveRight :size="16" /></a>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <article v-for="(service, index) in services.filter((item) => item.active)" :key="service.id" class="rounded-[20px] border border-[#e9ebe5] bg-white p-5 transition hover:border-[#b9cabb] hover:shadow-md" :class="index === 2 ? 'sm:col-span-2' : ''">
            <span class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#f0f3ed] text-[#64816a]"><component :is="service.icon === 'plane' ? MapPin : service.icon === 'train-front' ? TrainFront : service.icon === 'user-round' ? Users : Check" :size="21" /></span>
            <h3 class="font-display mt-4 text-[16px] font-bold text-[#34483a]">{{ service.name }}</h3>
            <p class="mt-2 max-w-[340px] text-[13px] leading-6 text-[#849087]">{{ service.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <section id="tentang" class="container-wide pb-20 sm:pb-24">
      <div class="relative overflow-hidden rounded-[28px] bg-[#244b3b] px-7 py-12 text-white sm:px-12 sm:py-14">
        <div class="absolute -right-20 -top-36 h-96 w-96 rounded-full border border-white/10"></div><div class="absolute -right-6 -top-20 h-64 w-64 rounded-full border border-white/10"></div>
        <div class="relative flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div><p class="mb-3 text-xs font-bold uppercase tracking-[2px] text-[#b5cdb6]">Waktunya mulai jalan</p><h2 class="font-display max-w-[540px] text-3xl font-extrabold tracking-[-1.2px] sm:text-[38px]">Perjalanan seru dimulai dari sini.</h2><p class="mt-3 text-sm text-white/70">Pilih mobil favoritmu. Kami siap bantu kapan saja.</p></div>
          <a href="#armada" class="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-3.5 text-sm font-bold text-[#31533d] transition hover:bg-[#e7eee6]">Lihat mobil <ArrowRight :size="16" /></a>
        </div>
      </div>
    </section>

    <footer class="border-t border-[#e9ebe5] py-7">
      <div class="container-wide flex flex-col items-center justify-between gap-4 text-xs text-[#858e86] sm:flex-row">
        <span>© 2026 Putra Jaya Rental. Teman baik di setiap perjalanan.</span>
        <span class="flex items-center gap-2"><ShieldCheck :size="14" /> Aman, nyaman, dan transparan.</span>
      </div>
    </footer>

    <a href="https://wa.me/6282217492009" aria-label="Hubungi kami via WhatsApp" class="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[#3d7251] text-white shadow-lg transition hover:scale-105"><MessageCircle :size="21" /></a>

    <div v-if="bookingCar" class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#18271f]/55 p-4 backdrop-blur-sm" @click.self="bookingCar = null">
      <form class="my-auto w-full max-w-[470px] rounded-[24px] bg-white p-6 shadow-2xl sm:p-8" @submit.prevent="submitBooking">
        <div class="flex items-start justify-between"><div><p class="text-xs font-semibold uppercase tracking-[1.5px] text-[#79917b]">Permintaan booking</p><h2 class="font-display mt-2 text-2xl font-extrabold tracking-tight text-[#293d31]">{{ bookingCar.name }}</h2></div><button type="button" class="rounded-full p-2 text-[#77847a] hover:bg-[#f1f3ef]" aria-label="Tutup" @click="bookingCar = null"><ChevronDown :size="20" /></button></div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <label class="text-xs font-semibold text-[#647167]">Nama lengkap<input v-model.trim="form.name" required minlength="2" maxlength="120" autocomplete="name" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]" placeholder="Nama kamu" /></label>
          <label class="text-xs font-semibold text-[#647167]">Nomor telepon<input v-model.trim="form.phone" required type="tel" pattern="(\+?62|0)[0-9]{8,15}" maxlength="18" autocomplete="tel" title="Masukkan nomor telepon Indonesia dengan angka saja, misalnya 081234567890" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]" placeholder="08xxxxxxxxxx" /></label>
          <label class="text-xs font-semibold text-[#647167] sm:col-span-2">Email<input v-model.trim="form.email" required type="email" maxlength="254" autocomplete="email" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]" placeholder="nama@email.com" /></label>
          <label class="text-xs font-semibold text-[#647167]">Tanggal ambil<input v-model="form.pickup" required type="date" :min="today" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]" /></label>
          <label class="text-xs font-semibold text-[#647167]">Tanggal kembali<input v-model="form.return" required type="date" :min="form.pickup || today" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]" /></label>
          <label class="text-xs font-semibold text-[#647167] sm:col-span-2">Pilih layanan<select v-model="form.service" required class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] bg-white px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]"><option disabled value="">Pilih layanan</option><option v-for="service in services.filter((item) => item.active)" :key="service.id" :value="service.name">{{ service.name }}</option></select></label>
          <label v-if="requiresAddress" class="text-xs font-semibold text-[#647167] sm:col-span-2">Alamat / nama lokasi jemput<input v-model="form.pickupAddress" required maxlength="500" autocomplete="street-address" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm text-[#344238] outline-none focus:border-[#78967c]" :placeholder="form.service.toLowerCase().includes('bandara') ? 'Contoh: Bandara Soekarno-Hatta, Terminal 3' : 'Contoh: Stasiun Gambir, pintu selatan'" /><span class="mt-1 block text-[10px] font-normal text-[#879188]">Tuliskan alamat atau nama lokasi antar/jemput.</span></label>
        </div>
        <TurnstileWidget
          v-if="!isDemo && turnstileSiteKey"
          :key="captchaWidgetKey"
          :site-key="turnstileSiteKey"
          @verified="captchaToken = $event"
          @error="captchaError = $event"
        />
        <p v-if="!isDemo && !turnstileSiteKey" class="mt-3 text-xs text-red-600">Widget verifikasi keamanan belum dikonfigurasi.</p>
        <p v-if="captchaError" class="mt-3 text-xs text-red-600">{{ captchaError }}</p>
        <p v-if="checkingAvailability" class="mt-3 text-xs text-[#738376]">Memeriksa ketersediaan mobil...</p>
        <p v-else-if="availabilityError" class="mt-3 text-xs text-red-600">{{ availabilityError }}</p>
        <p v-else-if="bookingAvailability" class="mt-3 text-xs" :class="bookingAvailability.available_quantity > 0 ? 'text-[#527455]' : 'text-[#b05f51]'">{{ bookingAvailability.available_quantity }} dari {{ bookingAvailability.quantity }} unit tersedia pada tanggal pilihan.</p>
        <p v-if="bookingError" class="mt-3 text-xs text-red-600">{{ bookingError }}</p>
        <p class="mt-4 rounded-xl border border-[#e9eadf] bg-[#f8f8f1] px-3.5 py-3 text-xs leading-5 text-[#69766b]">Setelah mengirim booking, mohon konfirmasi kembali dengan Customer Service kami agar detail perjalanan dan ketersediaan dapat dipastikan.</p>
        <button :disabled="submitting || checkingAvailability || Boolean(bookingAvailability && bookingAvailability.available_quantity < 1) || Boolean(availabilityError) || (!isDemo && !turnstileSiteKey)" class="mt-5 w-full rounded-full bg-[#244b3b] py-3.5 text-sm font-bold text-white transition hover:bg-[#18392c] disabled:cursor-not-allowed disabled:opacity-60">{{ submitting ? 'Mengirim...' : 'Kirim permintaan booking' }}</button>
      </form>
    </div>

    <div v-if="notice" class="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-[#244b3b] px-5 py-4 text-sm font-semibold text-white shadow-xl"><Check :size="18" /> {{ notice }}<button class="ml-1 text-white/70 hover:text-white" @click="notice = ''">×</button></div>
  </main>
</template>
