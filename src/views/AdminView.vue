<script setup>
import { ArrowLeft, ArrowUpRight, Bell, CalendarDays, CarFront, CircleAlert, Clock3, ImagePlus, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Trash2, TrendingUp, Users, Wrench, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { defaultHeroImage } from '../data'

const { cars, services, bookings, availability, heroImage, isDemo, refresh, refreshAvailability, refreshHeroImage, saveHeroImage, deleteHeroImage, saveCar, saveService, saveBooking, deleteCar, deleteService, deleteBooking } = useStore()
const section = ref('Ringkasan')
const search = ref('')
const showEditor = ref(false)
const editing = ref(null)
const editorType = ref('vehicles')
const loginEmail = ref('')
const loginPassword = ref('')
const sessionReady = ref(!isSupabaseConfigured)
const authenticated = ref(!isSupabaseConfigured)
const loginError = ref('')
const saving = ref(false)
const feedback = ref('')
const mobileNav = ref(false)
const editorForm = ref({})
const imageFile = ref(null)
const imagePreview = ref('')
const imageInput = ref(null)
const heroImageFile = ref(null)
const heroImagePreview = ref('')
const heroImageInput = ref(null)
let authSubscription

const navItems = [
  { label: 'Ringkasan', icon: LayoutDashboard },
  { label: 'Booking', icon: CalendarDays },
  { label: 'Armada', icon: CarFront },
  { label: 'Layanan', icon: Wrench },
  { label: 'Tampilan', icon: ImagePlus },
]
const pendingCount = computed(() => bookings.value.filter((booking) => booking.status === 'pending').length)
const confirmedCount = computed(() => bookings.value.filter((booking) => booking.status === 'confirmed').length)
const revenue = computed(() => bookings.value.filter((booking) => booking.status !== 'cancelled').reduce((sum, booking) => sum + Number(booking.total_price || 0), 0))
const totalFleet = computed(() => cars.value.reduce((sum, car) => sum + Number(car.quantity || 0), 0))
const availableFleet = computed(() => cars.value.reduce((sum, car) => sum + Number(availability.value[car.id]?.available_quantity ?? (car.available ? car.quantity : 0) ?? 0), 0))
const filteredBookings = computed(() => bookings.value.filter((booking) => `${booking.customer_name} ${booking.car_name} ${booking.customer_email} ${booking.customer_phone || ''}`.toLowerCase().includes(search.value.toLowerCase())))
const filteredCars = computed(() => cars.value.filter((car) => `${car.name} ${car.category}`.toLowerCase().includes(search.value.toLowerCase())))
const hasCustomHeroImage = computed(() => heroImage.value !== defaultHeroImage)
const formatPrice = (value) => new Intl.NumberFormat('id-ID').format(value || 0)
const formatShortPrice = (value) => value >= 1000000 ? `Rp ${(value / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : `Rp ${formatPrice(value)}`
const formatDate = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
const availableQuantity = (car) => Number(availability.value[car.id]?.available_quantity ?? (car.available ? car.quantity : 0))
const statusLabel = (status) => ({ pending: 'Menunggu', confirmed: 'Dikonfirmasi', completed: 'Selesai', cancelled: 'Dibatalkan' })[status] || status
const statusClass = (status) => ({ pending: 'bg-[#fff5e5] text-[#b17c2d]', confirmed: 'bg-[#e9f1eb] text-[#54755c]', completed: 'bg-[#eef0f3] text-[#707b89]', cancelled: 'bg-[#fbebea] text-[#bf6863]' })[status] || 'bg-gray-100 text-gray-600'

onMounted(async () => {
  if (isSupabaseConfigured) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      if (session) await checkAdmin(session.user.id)
      else sessionReady.value = true
    } catch (error) {
      loginError.value = `Tidak bisa memeriksa sesi admin: ${error.message}`
      sessionReady.value = true
    }
    const { data } = supabase.auth.onAuthStateChange((_event, sessionValue) => {
      if (sessionValue) checkAdmin(sessionValue.user.id).catch((error) => {
        authenticated.value = false
        sessionReady.value = true
        loginError.value = `Tidak bisa memverifikasi akses admin: ${error.message}`
      })
      else { authenticated.value = false; sessionReady.value = true }
    })
    authSubscription = data.subscription
  }
  if (authenticated.value) {
    try { await refresh() } catch (error) { feedback.value = `Gagal memuat data: ${error.message}` }
    try { await refreshHeroImage() } catch (error) { feedback.value = `Gagal memuat gambar utama website: ${error.message}` }
  }
})

onBeforeUnmount(() => authSubscription?.unsubscribe())
onBeforeUnmount(() => {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  if (heroImagePreview.value) URL.revokeObjectURL(heroImagePreview.value)
})

async function checkAdmin(userId) {
  const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  authenticated.value = Boolean(data)
  sessionReady.value = true
  return authenticated.value
}

async function signIn() {
  loginError.value = ''
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail.value, password: loginPassword.value })
  if (error) { loginError.value = error.message; return }
  try {
    await checkAdmin(data.user.id)
  } catch (accessError) {
    loginError.value = `Tidak bisa memverifikasi akses admin: ${accessError.message}`
    await supabase.auth.signOut()
    return
  }
  if (!authenticated.value) {
    loginError.value = 'Akun ini belum terdaftar sebagai admin. Minta pemilik toko menambahkan akses admin.'
    await supabase.auth.signOut()
  } else {
    try {
      await refresh()
      await refreshHeroImage()
    } catch (loadError) { feedback.value = `Gagal memuat data: ${loadError.message}` }
  }
}

async function signOut() {
  if (isSupabaseConfigured) await supabase.auth.signOut()
  authenticated.value = false
}

function openEditor(type, record = null) {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = null
  imagePreview.value = ''
  editorType.value = type
  editing.value = record
  const id = record?.id || crypto.randomUUID()
  if (type === 'vehicles') editorForm.value = record ? { ...record } : { id, name: '', category: 'MPV', transmission: 'Automatic', seats: 7, price: 450000, quantity: 1, image: '', available: true }
  else editorForm.value = record ? { requires_address: false, ...record } : { id, name: '', description: '', icon: 'user-round', active: true, requires_address: false }
  showEditor.value = true
}

function chooseImage(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  const maxSize = isDemo ? 1 : 5
  if (!allowedTypes.includes(file.type)) {
    feedback.value = 'Format gambar harus JPG, PNG, atau WebP.'
    event.target.value = ''
    return
  }
  if (file.size > maxSize * 1024 * 1024) {
    feedback.value = `Ukuran gambar maksimal ${maxSize} MB${isDemo ? ' dalam mode demo' : ''}.`
    event.target.value = ''
    return
  }

  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
}

function chooseHeroImage(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  const maxSize = isDemo ? 1 : 5
  if (!allowedTypes.includes(file.type)) {
    feedback.value = 'Format gambar harus JPG, PNG, atau WebP.'
    event.target.value = ''
    return
  }
  if (file.size > maxSize * 1024 * 1024) {
    feedback.value = `Ukuran gambar maksimal ${maxSize} MB${isDemo ? ' dalam mode demo' : ''}.`
    event.target.value = ''
    return
  }

  if (heroImagePreview.value) URL.revokeObjectURL(heroImagePreview.value)
  heroImageFile.value = file
  heroImagePreview.value = URL.createObjectURL(file)
}

async function saveHomepageHeroImage() {
  if (!heroImageFile.value) {
    feedback.value = 'Pilih gambar baru terlebih dahulu.'
    return
  }

  saving.value = true
  try {
    await saveHeroImage(heroImageFile.value)
    heroImageFile.value = null
    if (heroImagePreview.value) URL.revokeObjectURL(heroImagePreview.value)
    heroImagePreview.value = ''
    if (heroImageInput.value) heroImageInput.value.value = ''
    feedback.value = 'Gambar utama website berhasil diperbarui.'
  } catch (error) {
    feedback.value = error.message || 'Gambar utama website gagal disimpan.'
  } finally {
    saving.value = false
  }
}

async function resetHomepageHeroImage() {
  if (!window.confirm('Hapus gambar utama kustom dan gunakan gambar bawaan?')) return

  saving.value = true
  try {
    await deleteHeroImage()
    heroImageFile.value = null
    if (heroImagePreview.value) URL.revokeObjectURL(heroImagePreview.value)
    heroImagePreview.value = ''
    if (heroImageInput.value) heroImageInput.value.value = ''
    feedback.value = 'Gambar utama dihapus. Gambar bawaan website sekarang digunakan.'
  } catch (error) {
    feedback.value = error.message || 'Gambar utama website gagal dihapus.'
  } finally {
    saving.value = false
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Gambar gagal dibaca. Silakan coba lagi.'))
    reader.readAsDataURL(file)
  })
}

async function submitEditor() {
  saving.value = true
  let cleanupWarning = ''
  try {
    if (editorType.value === 'services') {
      const normalizedName = editorForm.value.name.trim().toLowerCase()
      const duplicateService = services.value.some((service) =>
        service.id !== editorForm.value.id
        && service.name.trim().toLowerCase() === normalizedName,
      )
      if (duplicateService) throw new Error('Nama layanan tersebut sudah digunakan.')
    }
    if (editorType.value === 'vehicles') {
      const previousImagePath = editorForm.value.image_path
      let uploadedImagePath
      const record = { ...editorForm.value, seats: Number(editorForm.value.seats), price: Number(editorForm.value.price), quantity: Number(editorForm.value.quantity) }

      if (imageFile.value && isSupabaseConfigured) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[imageFile.value.type]
        uploadedImagePath = `${record.id}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('vehicle-images').upload(uploadedImagePath, imageFile.value, {
          cacheControl: '3600',
          contentType: imageFile.value.type,
          upsert: false,
        })
        if (error) throw error
        record.image_path = uploadedImagePath
        record.image = supabase.storage.from('vehicle-images').getPublicUrl(uploadedImagePath).data.publicUrl
      } else if (imageFile.value) {
        record.image = await readImageAsDataUrl(imageFile.value)
        record.image_path = null
      } else if (!record.image) {
        throw new Error('Pilih gambar mobil terlebih dahulu.')
      }

      try {
        await saveCar(record)
      } catch (error) {
        if (uploadedImagePath) {
          const { error: cleanupError } = await supabase.storage.from('vehicle-images').remove([uploadedImagePath])
          if (cleanupError) throw new Error(`${error.message}. Gambar yang sempat diunggah juga gagal dibersihkan: ${cleanupError.message}`)
        }
        throw error
      }

      try {
        await refreshAvailability()
      } catch (error) {
        cleanupWarning = `Mobil tersimpan, tetapi ketersediaan stok gagal diperbarui: ${error.message}`
      }

      if (uploadedImagePath && previousImagePath && previousImagePath !== uploadedImagePath) {
        const { error } = await supabase.storage.from('vehicle-images').remove([previousImagePath])
        if (error) cleanupWarning = `Mobil tersimpan, tetapi gambar lama gagal dihapus: ${error.message}`
      }
    } else {
      await saveService(editorForm.value)
    }
    showEditor.value = false
    feedback.value = cleanupWarning || 'Perubahan berhasil disimpan.'
  } catch (error) { feedback.value = error.message || 'Perubahan gagal disimpan.' }
  finally { saving.value = false }
}

async function changeStatus(booking, status, event) {
  try {
    await saveBooking({ ...booking, status })
    feedback.value = `Booking ${statusLabel(status).toLowerCase()}.`
    try {
      await refreshAvailability()
    } catch (error) {
      feedback.value = `Status booking tersimpan, tetapi ketersediaan stok gagal diperbarui: ${error.message}`
    }
  } catch (error) {
    event.target.value = booking.status
    feedback.value = error.message || 'Status gagal diperbarui.'
  }
}

async function removeRecord(type, record) {
  if (!window.confirm(`Hapus ${record.name || record.customer_name}? Tindakan ini tidak bisa dibatalkan.`)) return
  try {
    if (type === 'vehicles') {
      await deleteCar(record.id)
      feedback.value = 'Data berhasil dihapus.'
      try {
        await refreshAvailability()
      } catch (error) {
        feedback.value = `Mobil terhapus, tetapi ketersediaan stok gagal diperbarui: ${error.message}`
      }
    } else if (type === 'services') {
      await deleteService(record.id)
      feedback.value = 'Data berhasil dihapus.'
    } else {
      await deleteBooking(record.id)
      feedback.value = 'Data berhasil dihapus.'
    }
    if (type === 'vehicles' && record.image_path && isSupabaseConfigured) {
      const { error } = await supabase.storage.from('vehicle-images').remove([record.image_path])
      if (error) feedback.value = `Data mobil terhapus, tetapi gambar gagal dihapus dari storage: ${error.message}`
    }
  } catch (error) { feedback.value = error.message || 'Data gagal dihapus.' }
}
</script>

<template>
  <div v-if="!sessionReady" class="flex min-h-screen items-center justify-center bg-[#f7f8f5] text-sm text-[#748178]">Memeriksa sesi admin...</div>
  <div v-else-if="!authenticated" class="flex min-h-screen items-center justify-center bg-[#f5f6f2] px-4 py-10">
    <div class="w-full max-w-[430px] rounded-[26px] border border-[#e8ebe5] bg-white p-7 shadow-sm sm:p-9">
      <RouterLink to="/" class="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#617368]"><ArrowLeft :size="16" /> Kembali ke website</RouterLink>
      <div class="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#244b3b] text-white"><ShieldCheck :size="23" /></div>
      <p class="text-xs font-bold uppercase tracking-[1.5px] text-[#79917b]">Area khusus admin</p>
      <h1 class="font-display mt-2 text-[28px] font-extrabold tracking-[-1px] text-[#293d31]">Selamat datang.</h1>
      <p class="mt-2 text-sm leading-6 text-[#7b867d]">{{ isDemo ? 'Coba dashboard dalam mode demo, tanpa akun.' : 'Masuk untuk mengelola rental dan permintaan booking.' }}</p>
      <form v-if="isSupabaseConfigured" class="mt-7 space-y-4" @submit.prevent="signIn">
        <label class="block text-xs font-semibold text-[#647167]">Email<input v-model="loginEmail" required type="email" autocomplete="username" class="mt-1.5 w-full rounded-xl border border-[#e4e8e2] px-3.5 py-3 text-sm outline-none focus:border-[#77967c]" placeholder="admin@email.com" /></label>
        <label class="block text-xs font-semibold text-[#647167]">Kata sandi<input v-model="loginPassword" required type="password" autocomplete="current-password" class="mt-1.5 w-full rounded-xl border border-[#e4e8e2] px-3.5 py-3 text-sm outline-none focus:border-[#77967c]" placeholder="••••••••" /></label>
        <p v-if="loginError" class="text-xs text-red-600">{{ loginError }}</p>
        <button class="w-full rounded-full bg-[#244b3b] py-3.5 text-sm font-bold text-white hover:bg-[#18392c]">Masuk ke dashboard</button>
      </form>
      <div v-else class="mt-7 rounded-2xl bg-[#f3f5f0] p-4 text-sm leading-6 text-[#68766b]"><p class="font-semibold text-[#3e5945]">Mode demo aktif</p><p class="mt-1">Data contoh tersimpan di browser ini. Hubungkan Supabase untuk mulai memakai database dan login admin.</p><RouterLink to="/#armada" class="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#45664d]">Lihat tampilan website <ArrowUpRight :size="14" /></RouterLink></div>
    </div>
  </div>
  <div v-else class="min-h-screen bg-[#f7f8f5] text-[#344238]">
    <div class="flex min-h-screen">
      <div v-if="mobileNav" class="fixed inset-0 z-30 bg-[#17231c]/40 lg:hidden" @click="mobileNav = false"></div>
      <aside class="fixed inset-y-0 left-0 z-40 flex w-[248px] -translate-x-full flex-col border-r border-[#e9ece6] bg-white px-5 py-6 transition-transform lg:relative lg:translate-x-0" :class="mobileNav ? 'translate-x-0' : ''">
        <div class="flex items-center justify-between">
          <RouterLink to="/" class="flex items-center gap-2.5">
            <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#244b3b] text-white"><CarFront :size="21" /></span>
            <span class="font-display text-[20px] font-extrabold tracking-[-1px] text-[#293d31]">Putra Jaya Rental<span class="text-[#85a487]">.</span></span>
          </RouterLink>
          <button class="rounded-lg p-1.5 text-[#748178] lg:hidden" @click="mobileNav = false"><X :size="19" /></button>
        </div>
        <p class="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[1.5px] text-[#a0a9a0]">Workspace</p>
        <nav class="space-y-1">
          <button v-for="item in navItems" :key="item.label" class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium transition" :class="section === item.label ? 'bg-[#edf2ec] font-bold text-[#34563e]' : 'text-[#748078] hover:bg-[#f7f8f5] hover:text-[#3a5241]'" @click="section = item.label; mobileNav = false">
            <component :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <span v-if="item.label === 'Booking' && pendingCount" class="ml-auto rounded-full bg-[#f6e5c9] px-2 py-0.5 text-[10px] font-bold text-[#a7742e]">{{ pendingCount }}</span>
          </button>
        </nav>
        <div class="mt-auto">
          <div class="mb-4 rounded-2xl bg-[#f3f5f0] p-4">
            <div class="flex items-center justify-between"><span class="text-[11px] font-semibold text-[#4c6450]">{{ isDemo ? 'Mode demo' : 'Supabase aktif' }}</span><span class="h-2 w-2 rounded-full" :class="isDemo ? 'bg-[#d6a04c]' : 'bg-[#66a270]'"></span></div>
            <p class="mt-2 text-[11px] leading-5 text-[#879188]">{{ isDemo ? 'Perubahan disimpan di browser ini.' : 'Data tersimpan di database cloud.' }}</p>
          </div>
          <button @click="signOut" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#78837a] hover:bg-[#f6f7f3]"><LogOut :size="16" /> Keluar dari dashboard</button>
        </div>
      </aside>

      <main class="min-w-0 flex-1">
        <header class="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#eaede7] bg-[#f7f8f5]/95 px-4 backdrop-blur sm:px-8">
          <div class="flex items-center gap-3">
            <button class="rounded-lg p-2 text-[#52635a] hover:bg-white lg:hidden" aria-label="Buka navigasi" @click="mobileNav = true"><Menu :size="20" /></button>
            <div><p class="text-[10px] font-medium text-[#919b92]">Putra Jaya Rental <span class="mx-1.5">/</span> <span class="text-[#65736a]">{{ section }}</span></p><p class="font-display mt-0.5 text-sm font-bold text-[#35463a]">{{ section === 'Ringkasan' ? 'Ringkasan bisnis' : `Kelola ${section.toLowerCase()}` }}</p></div>
          </div>
          <div class="flex items-center gap-3">
            <button class="relative rounded-xl border border-[#e9ece6] bg-white p-2.5 text-[#748078]" aria-label="Notifikasi"><Bell :size="16" /><span v-if="pendingCount" class="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#d59b49]"></span></button>
            <div class="hidden h-8 w-px bg-[#e7eae4] sm:block"></div>
            <div class="flex items-center gap-2.5"><div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#dfe9dc] text-[11px] font-bold text-[#4d6c52]">JD</div><div class="hidden sm:block"><p class="text-xs font-bold text-[#46564a]">{{ isDemo ? 'Jalanin Admin' : 'Administrator' }}</p><p class="text-[10px] text-[#8b958c]">{{ isDemo ? 'Mode demo' : 'Admin' }}</p></div></div>
          </div>
        </header>

        <div class="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-9">
          <div v-if="feedback" class="mb-5 flex items-start justify-between gap-3 rounded-xl border border-[#dfe9de] bg-[#f0f5ee] px-4 py-3 text-xs text-[#4c684f]"><span class="flex items-center gap-2"><CircleAlert :size="15" />{{ feedback }}</span><button aria-label="Tutup pemberitahuan" @click="feedback = ''"><X :size="14" /></button></div>

          <template v-if="section === 'Ringkasan'">
            <div class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p class="text-xs text-[#88938a]">{{ new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</p><h1 class="font-display mt-1 text-[26px] font-extrabold tracking-[-1px] text-[#2d4033] sm:text-[30px]">Hai, {{ isDemo ? 'Jalanin' : 'Admin' }} <span>👋</span></h1><p class="mt-1 text-sm text-[#7c887f]">Ini yang sedang terjadi di rentalmu.</p></div>
              <button class="inline-flex w-fit items-center gap-2 rounded-full bg-[#244b3b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#18392c]" @click="section = 'Booking'">Lihat booking <ArrowUpRight :size="15" /></button>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article v-for="card in [
                { label: 'Total booking', value: bookings.length, detail: `${pendingCount} perlu dikonfirmasi`, icon: CalendarDays, tint: 'bg-[#eaf0e8] text-[#5c795e]' },
                { label: 'Unit tersedia hari ini', value: availableFleet, detail: `dari ${totalFleet} unit armada`, icon: CarFront, tint: 'bg-[#edf0f4] text-[#6c7c91]' },
                { label: 'Menunggu konfirmasi', value: pendingCount, detail: 'Booking baru masuk', icon: Clock3, tint: 'bg-[#fbf1e2] text-[#ba8a42]' },
                { label: 'Total nilai booking', value: formatShortPrice(revenue), detail: `${confirmedCount} booking dikonfirmasi`, icon: TrendingUp, tint: 'bg-[#eaf1ec] text-[#59816a]' },
              ]" :key="card.label" class="admin-shadow rounded-[18px] border border-[#eceee9] bg-white p-5">
                <div class="flex items-center justify-between"><p class="text-xs font-medium text-[#7e8980]">{{ card.label }}</p><span class="flex h-9 w-9 items-center justify-center rounded-xl" :class="card.tint"><component :is="card.icon" :size="17" /></span></div>
                <p class="font-display mt-4 text-[27px] font-extrabold tracking-[-1px] text-[#354639]">{{ card.value }}</p><p class="mt-1 text-[11px] text-[#8e978e]">{{ card.detail }}</p>
              </article>
            </div>

            <div class="mt-6 grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
              <section class="admin-shadow overflow-hidden rounded-[18px] border border-[#eceee9] bg-white">
                <div class="flex items-center justify-between border-b border-[#f0f1ed] px-5 py-4"><div><h2 class="text-sm font-bold text-[#3c4d40]">Booking terbaru</h2><p class="mt-1 text-[11px] text-[#919a91]">Pantau permintaan yang baru masuk</p></div><button class="text-xs font-bold text-[#5b785f] hover:text-[#244b3b]" @click="section = 'Booking'">Lihat semua →</button></div>
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[560px] text-left">
                    <thead><tr class="bg-[#fbfcfa] text-[10px] font-semibold uppercase tracking-wider text-[#9aa39a]"><th class="px-5 py-3">Pelanggan</th><th class="px-4 py-3">Mobil & tanggal</th><th class="px-4 py-3">Total</th><th class="px-5 py-3">Status</th></tr></thead>
                    <tbody><tr v-for="booking in bookings.slice(0, 4)" :key="booking.id" class="border-t border-[#f1f2ee] text-xs"><td class="px-5 py-3.5"><p class="font-semibold text-[#4b5a4e]">{{ booking.customer_name }}</p><p class="mt-1 text-[10px] text-[#959d95]">{{ booking.customer_email }}</p><p v-if="booking.customer_phone" class="mt-1 text-[10px] font-medium text-[#617568]">Tel: {{ booking.customer_phone }}</p></td><td class="px-4 py-3.5"><p class="font-medium text-[#5b685e]">{{ booking.car_name }}</p><p class="mt-1 text-[10px] text-[#959d95]">{{ formatDate(booking.pickup_date) }} – {{ formatDate(booking.return_date) }}</p></td><td class="px-4 py-3.5 font-semibold text-[#526854]">Rp{{ formatPrice(booking.total_price) }}</td><td class="px-5 py-3.5"><span class="rounded-full px-2.5 py-1 text-[10px] font-semibold" :class="statusClass(booking.status)">{{ statusLabel(booking.status) }}</span></td></tr></tbody>
                  </table>
                  <div v-if="!bookings.length" class="p-8 text-center text-xs text-[#89958c]">Belum ada booking.</div>
                </div>
              </section>

              <section class="admin-shadow rounded-[18px] border border-[#eceee9] bg-white p-5">
                <div class="flex items-start justify-between"><div><h2 class="text-sm font-bold text-[#3c4d40]">Status armada</h2><p class="mt-1 text-[11px] text-[#919a91]">Ketersediaan mobil saat ini</p></div><button class="rounded-lg p-1.5 text-[#89948b] hover:bg-[#f5f6f3]" aria-label="Kelola armada" @click="section = 'Armada'"><MoreHorizontal :size="17" /></button></div>
                <div class="mt-4 space-y-1">
                  <div v-for="car in cars.slice(0, 5)" :key="car.id" class="flex items-center gap-3 border-b border-[#f1f2ee] py-3 last:border-0">
                    <img :src="car.image" :alt="car.name" class="h-9 w-12 rounded-lg bg-[#edf0e9] object-cover" /><div class="min-w-0 flex-1"><p class="truncate text-xs font-semibold text-[#536157]">{{ car.name }}</p><p class="mt-1 text-[10px] text-[#9aa39a]">{{ car.category }} · {{ car.seats }} kursi</p></div><span class="flex items-center gap-1.5 text-[10px] font-semibold" :class="availableQuantity(car) > 0 ? 'text-[#66866a]' : 'text-[#bf736c]'"><span class="h-1.5 w-1.5 rounded-full" :class="availableQuantity(car) > 0 ? 'bg-[#78a87d]' : 'bg-[#d5847c]'"></span>{{ availableQuantity(car) }} / {{ availability[car.id]?.quantity ?? car.quantity }} unit tersedia</span>
                  </div>
                  <div v-if="!cars.length" class="py-7 text-center text-xs text-[#89958c]">Belum ada armada.</div>
                </div>
                <button class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f3f5f1] py-2.5 text-xs font-bold text-[#547258] hover:bg-[#e9efe7]" @click="section = 'Armada'">Kelola armada <ArrowUpRight :size="14" /></button>
              </section>
            </div>
          </template>

          <template v-else-if="section === 'Booking'">
            <div class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs text-[#88938a]">Pesanan dan permintaan pelanggan</p><h1 class="font-display mt-1 text-[28px] font-extrabold tracking-[-1px] text-[#2d4033]">Booking</h1><p class="mt-1 text-sm text-[#7c887f]">Perbarui status dan pantau semua permintaan sewa.</p></div><div class="flex items-center gap-2 rounded-xl border border-[#e8ebe5] bg-white px-3 py-2.5"><Search :size="15" class="text-[#98a199]" /><input v-model="search" class="w-full bg-transparent text-xs outline-none placeholder:text-[#a0a9a1] sm:w-48" placeholder="Cari nama atau mobil..." /></div></div>
            <div class="admin-shadow overflow-hidden rounded-[18px] border border-[#eceee9] bg-white"><div class="overflow-x-auto"><table class="w-full min-w-[860px] text-left"><thead><tr class="bg-[#fbfcfa] text-[10px] font-bold uppercase tracking-wider text-[#9aa39a]"><th class="px-5 py-3.5">Pelanggan</th><th class="px-4 py-3.5">Mobil & layanan</th><th class="px-4 py-3.5">Periode sewa</th><th class="px-4 py-3.5">Total</th><th class="px-4 py-3.5">Status</th><th class="px-4 py-3.5">Ubah status</th><th class="px-4 py-3.5"></th></tr></thead><tbody><tr v-for="booking in filteredBookings" :key="booking.id" class="border-t border-[#f1f2ee] text-xs"><td class="px-5 py-4"><p class="font-semibold text-[#4b5a4e]">{{ booking.customer_name }}</p><p class="mt-1 text-[10px] text-[#959d95]">{{ booking.customer_email }}</p><a v-if="booking.customer_phone" :href="`tel:${booking.customer_phone.replace(/[^\\d+]/g, '')}`" class="mt-1 inline-block text-[10px] font-semibold text-[#52745b] hover:underline">Tel: {{ booking.customer_phone }}</a></td><td class="px-4 py-4"><p class="font-semibold text-[#58655a]">{{ booking.car_name }}</p><p class="mt-1 text-[10px] text-[#959d95]">{{ booking.service_name }}</p><p v-if="booking.pickup_address" class="mt-1 max-w-[210px] text-[10px] leading-4 text-[#63766a]">Lokasi: {{ booking.pickup_address }}</p></td><td class="px-4 py-4 text-[#69766c]">{{ formatDate(booking.pickup_date) }}<p class="mt-1 text-[10px] text-[#959d95]">s/d {{ formatDate(booking.return_date) }}</p></td><td class="px-4 py-4 font-semibold text-[#536d56]">Rp{{ formatPrice(booking.total_price) }}</td><td class="px-4 py-4"><span class="rounded-full px-2.5 py-1 text-[10px] font-semibold" :class="statusClass(booking.status)">{{ statusLabel(booking.status) }}</span></td><td class="px-4 py-4"><select :value="booking.status" class="rounded-lg border border-[#e9ece6] bg-white px-2 py-1.5 text-[10px] text-[#627067] outline-none" @change="changeStatus(booking, $event.target.value, $event)"><option value="pending">Menunggu</option><option value="confirmed">Dikonfirmasi</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select></td><td class="px-4 py-4"><button class="rounded-lg p-2 text-[#b77b75] hover:bg-[#fbefed]" aria-label="Hapus booking" @click="removeRecord('bookings', booking)"><Trash2 :size="15" /></button></td></tr></tbody></table><div v-if="!filteredBookings.length" class="p-12 text-center text-sm text-[#89958c]">Belum ada booking yang cocok.</div></div></div>
          </template>

          <template v-else-if="section === 'Tampilan'">
            <div class="mb-7"><p class="text-xs text-[#88938a]">Atur gambar yang tampil di halaman depan</p><h1 class="font-display mt-1 text-[28px] font-extrabold tracking-[-1px] text-[#2d4033]">Tampilan website</h1><p class="mt-1 text-sm text-[#7c887f]">Ganti atau hapus gambar utama pada bagian hero halaman beranda.</p></div>
            <section class="admin-shadow max-w-3xl overflow-hidden rounded-[18px] border border-[#eceee9] bg-white">
              <div class="aspect-[16/8] bg-[#e7e9e2]">
                <img class="h-full w-full object-cover" :src="heroImagePreview || heroImage" alt="Pratinjau gambar utama website" />
              </div>
              <div class="p-5 sm:p-6">
                <p class="text-sm font-bold text-[#3c4d40]">Gambar utama halaman depan</p>
                <p class="mt-1 text-xs leading-5 text-[#849087]">{{ hasCustomHeroImage ? 'Gambar kustom sedang digunakan.' : 'Gambar bawaan sedang digunakan.' }} Unggah JPG, PNG, atau WebP, maksimal {{ isDemo ? '1' : '5' }} MB.</p>
                <input ref="heroImageInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="chooseHeroImage" />
                <div class="mt-5 flex flex-wrap gap-2">
                  <button type="button" class="inline-flex items-center gap-2 rounded-full bg-[#edf2ec] px-4 py-2.5 text-xs font-bold text-[#45664d] hover:bg-[#e2ebe1]" @click="heroImageInput?.click()"><ImagePlus :size="15" /> Pilih gambar</button>
                  <button type="button" :disabled="!heroImageFile || saving" class="rounded-full bg-[#244b3b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#18392c] disabled:cursor-not-allowed disabled:opacity-50" @click="saveHomepageHeroImage">{{ saving ? 'Menyimpan...' : 'Simpan gambar' }}</button>
                  <button v-if="hasCustomHeroImage" type="button" :disabled="saving" class="inline-flex items-center gap-2 rounded-full border border-[#f0dddd] px-4 py-2.5 text-xs font-bold text-[#a95e58] hover:bg-[#fbefed] disabled:opacity-50" @click="resetHomepageHeroImage"><Trash2 :size="14" /> Hapus dan gunakan bawaan</button>
                </div>
                <p v-if="isDemo" class="mt-4 rounded-xl bg-[#f8f6ee] px-3.5 py-3 text-[11px] leading-5 text-[#81734f]">Mode demo menyimpan gambar di browser ini saja. Hubungkan Supabase dan jalankan migrasi bucket agar gambar tampil ke semua pengunjung.</p>
              </div>
            </section>
          </template>

          <template v-else-if="section === 'Armada'">
            <div class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs text-[#88938a]">Kelola mobil rentalmu</p><h1 class="font-display mt-1 text-[28px] font-extrabold tracking-[-1px] text-[#2d4033]">Armada</h1><p class="mt-1 text-sm text-[#7c887f]">Atur harga, detail, dan ketersediaan mobil.</p></div><button class="inline-flex w-fit items-center gap-2 rounded-full bg-[#244b3b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#18392c]" @click="openEditor('vehicles')"><Plus :size="15" /> Tambah mobil</button></div>
            <div class="mb-4 flex items-center gap-2 rounded-xl border border-[#e8ebe5] bg-white px-3 py-2.5 sm:w-72"><Search :size="15" class="text-[#98a199]" /><input v-model="search" class="w-full bg-transparent text-xs outline-none placeholder:text-[#a0a9a1]" placeholder="Cari nama atau kategori..." /></div>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><article v-for="car in filteredCars" :key="car.id" class="admin-shadow overflow-hidden rounded-[18px] border border-[#eceee9] bg-white"><div class="relative h-44 bg-[#e7e9e2]"><img class="h-full w-full object-cover" :src="car.image" :alt="car.name" /><span class="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-[#52685a]">{{ car.category }}</span><span class="absolute right-3 top-3 rounded-full px-3 py-1.5 text-[10px] font-semibold" :class="availableQuantity(car) > 0 ? 'bg-[#edf5ed] text-[#54755c]' : 'bg-[#fbebea] text-[#bf6863]'">{{ availableQuantity(car) }} / {{ availability[car.id]?.quantity ?? car.quantity }} tersedia hari ini</span></div><div class="p-4"><div class="flex items-start justify-between gap-3"><div><h2 class="font-display text-[15px] font-bold text-[#3b4c3f]">{{ car.name }}</h2><p class="mt-1.5 text-[11px] text-[#8a948b]">{{ car.transmission }} · {{ car.seats }} kursi</p></div><div class="flex gap-1"><button class="rounded-lg p-2 text-[#718077] hover:bg-[#f3f5f1]" aria-label="Edit mobil" @click="openEditor('vehicles', car)"><Settings2 :size="15" /></button><button class="rounded-lg p-2 text-[#b77b75] hover:bg-[#fbefed]" aria-label="Hapus mobil" @click="removeRecord('vehicles', car)"><Trash2 :size="15" /></button></div></div><p class="mt-4 border-t border-[#f0f1ed] pt-3 text-sm font-bold text-[#527055]">Rp{{ formatPrice(car.price) }} <span class="text-[10px] font-medium text-[#929b92]">/ hari</span></p></div></article></div>
            <div v-if="!filteredCars.length" class="rounded-2xl bg-white p-12 text-center text-sm text-[#89958c]">Belum ada mobil yang cocok.</div>
          </template>

          <template v-else>
            <div class="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p class="text-xs text-[#88938a]">Atur pilihan layanan pelanggan</p><h1 class="font-display mt-1 text-[28px] font-extrabold tracking-[-1px] text-[#2d4033]">Layanan</h1><p class="mt-1 text-sm text-[#7c887f]">Tambah layanan dan atur mana yang ditampilkan di website.</p></div><button class="inline-flex w-fit items-center gap-2 rounded-full bg-[#244b3b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#18392c]" @click="openEditor('services')"><Plus :size="15" /> Tambah layanan</button></div>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><article v-for="service in services" :key="service.id" class="admin-shadow rounded-[18px] border border-[#eceee9] bg-white p-5"><div class="flex items-start justify-between"><span class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf2ec] text-[#64816a]"><Wrench :size="19" /></span><div class="flex items-center gap-1"><button class="rounded-lg p-2 text-[#718077] hover:bg-[#f3f5f1]" aria-label="Edit layanan" @click="openEditor('services', service)"><Settings2 :size="15" /></button><button class="rounded-lg p-2 text-[#b77b75] hover:bg-[#fbefed]" aria-label="Hapus layanan" @click="removeRecord('services', service)"><Trash2 :size="15" /></button></div></div><h2 class="font-display mt-4 text-[16px] font-bold text-[#3b4c3f]">{{ service.name }}</h2><p class="mt-2 min-h-10 text-xs leading-5 text-[#859087]">{{ service.description }}</p><p v-if="service.requires_address" class="mt-2 text-[10px] font-semibold text-[#75876f]">Alamat/lokasi jemput wajib</p><div class="mt-4 flex items-center justify-between border-t border-[#f0f1ed] pt-3"><span class="flex items-center gap-1.5 text-[10px] font-semibold" :class="service.active ? 'text-[#66866a]' : 'text-[#9ba29b]'"><span class="h-1.5 w-1.5 rounded-full" :class="service.active ? 'bg-[#78a87d]' : 'bg-[#b9c0b9]'"></span>{{ service.active ? 'Aktif di website' : 'Disembunyikan' }}</span><button class="text-[10px] font-bold text-[#5b785f]" @click="saveService({ ...service, active: !service.active }).then(() => feedback = 'Tampilan layanan diperbarui.').catch((error) => feedback = error.message)">{{ service.active ? 'Sembunyikan' : 'Tampilkan' }}</button></div></article></div>
            <div v-if="!services.length" class="rounded-2xl bg-white p-12 text-center text-sm text-[#89958c]">Belum ada layanan. Tambahkan layanan pertamamu.</div>
          </template>
        </div>
      </main>
    </div>

    <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#18271f]/55 p-4 backdrop-blur-sm" @click.self="showEditor = false">
      <form class="my-auto w-full max-w-[500px] rounded-[24px] bg-white p-6 shadow-2xl sm:p-8" @submit.prevent="submitEditor">
        <div class="mb-6 flex items-start justify-between"><div><p class="text-xs font-semibold uppercase tracking-[1.5px] text-[#79917b]">{{ editorType === 'vehicles' ? 'Katalog kendaraan' : 'Pilihan perjalanan' }}</p><h2 class="font-display mt-2 text-2xl font-extrabold tracking-tight text-[#293d31]">{{ editing ? 'Edit' : 'Tambah' }} {{ editorType === 'vehicles' ? 'mobil' : 'layanan' }}</h2></div><button type="button" class="rounded-full p-2 text-[#77847a] hover:bg-[#f1f3ef]" aria-label="Tutup" @click="showEditor = false"><X :size="19" /></button></div>
        <template v-if="editorType === 'vehicles'">
          <label class="mb-4 block text-xs font-semibold text-[#647167]">Nama mobil<input v-model="editorForm.name" required class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm outline-none focus:border-[#78967c]" placeholder="Toyota Avanza Veloz" /></label>
          <div class="mb-4 grid grid-cols-2 gap-3"><label class="text-xs font-semibold text-[#647167]">Kategori<select v-model="editorForm.category" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] bg-white px-3 py-2.5 text-sm outline-none"><option>MPV</option><option>SUV</option><option>Premium</option><option>City car</option></select></label><label class="text-xs font-semibold text-[#647167]">Transmisi<select v-model="editorForm.transmission" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] bg-white px-3 py-2.5 text-sm outline-none"><option>Automatic</option><option>Manual</option></select></label></div>
          <div class="mb-4 grid grid-cols-3 gap-3"><label class="text-xs font-semibold text-[#647167]">Jumlah kursi<input v-model="editorForm.seats" required type="number" min="1" max="20" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm outline-none" /></label><label class="text-xs font-semibold text-[#647167]">Harga / hari<input v-model="editorForm.price" required type="number" min="1" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm outline-none" /></label><label class="text-xs font-semibold text-[#647167]">Jumlah unit<input v-model="editorForm.quantity" required type="number" min="0" max="999" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm outline-none" /></label></div>
          <div class="mb-4">
            <span class="block text-xs font-semibold text-[#647167]">Foto mobil</span>
            <div class="mt-1.5 flex items-center gap-3 rounded-xl border border-dashed border-[#cfd8ce] bg-[#fafbf9] p-3">
              <div class="flex h-[76px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#edf0e9]">
                <img v-if="imagePreview || editorForm.image" :src="imagePreview || editorForm.image" alt="Pratinjau foto mobil" class="h-full w-full object-cover" />
                <ImagePlus v-else :size="23" class="text-[#829285]" />
              </div>
              <div class="min-w-0 flex-1">
                <label class="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#eaf0e8] px-3.5 py-2 text-xs font-bold text-[#49654d] transition hover:bg-[#dfe9dd]">
                  <ImagePlus :size="14" /> {{ imagePreview || editorForm.image ? 'Ganti gambar' : 'Pilih gambar' }}
                  <input ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="chooseImage" />
                </label>
                <p class="mt-2 text-[10px] leading-4 text-[#879188]">JPG, PNG, atau WebP · maks. {{ isDemo ? '1 MB (demo)' : '5 MB' }}</p>
                <p v-if="imageFile" class="mt-1 truncate text-[10px] text-[#627568]">{{ imageFile.name }}</p>
              </div>
            </div>
          </div>
          <label class="flex items-center gap-2 text-xs font-medium text-[#647167]"><input v-model="editorForm.available" type="checkbox" class="accent-[#42674d]" /> Mobil tersedia untuk disewa</label>
        </template>
        <template v-else>
          <label class="mb-4 block text-xs font-semibold text-[#647167]">Nama layanan<input v-model.trim="editorForm.name" required maxlength="120" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm outline-none focus:border-[#78967c]" placeholder="Antar jemput bandara" /></label>
          <label class="mb-4 block text-xs font-semibold text-[#647167]">Deskripsi<textarea v-model="editorForm.description" required rows="3" class="mt-1.5 w-full resize-none rounded-xl border border-[#e5e9e3] px-3 py-2.5 text-sm outline-none focus:border-[#78967c]" placeholder="Jelaskan layananmu..."></textarea></label>
          <label class="mb-4 block text-xs font-semibold text-[#647167]">Ikon<select v-model="editorForm.icon" class="mt-1.5 w-full rounded-xl border border-[#e5e9e3] bg-white px-3 py-2.5 text-sm outline-none"><option value="user-round">Sopir</option><option value="plane">Bandara</option><option value="train-front">Stasiun</option></select></label>
          <label class="mb-4 flex items-center gap-2 text-xs font-medium text-[#647167]"><input v-model="editorForm.requires_address" type="checkbox" class="accent-[#42674d]" /> Wajib meminta alamat / nama lokasi jemput</label>
          <label class="flex items-center gap-2 text-xs font-medium text-[#647167]"><input v-model="editorForm.active" type="checkbox" class="accent-[#42674d]" /> Tampilkan layanan di website</label>
        </template>
        <button :disabled="saving" class="mt-7 w-full rounded-full bg-[#244b3b] py-3.5 text-sm font-bold text-white transition hover:bg-[#18392c] disabled:opacity-60">{{ saving ? 'Menyimpan...' : 'Simpan perubahan' }}</button>
      </form>
    </div>
  </div>
</template>
