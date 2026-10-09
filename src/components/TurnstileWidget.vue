<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  siteKey: { type: String, required: true },
})
const emit = defineEmits(['verified', 'error'])
const container = ref(null)
let widgetId
let loadPromise

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => window.turnstile
      ? resolve(window.turnstile)
      : reject(new Error('Widget verifikasi gagal dimuat.'))
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Widget verifikasi gagal dimuat.'))
    }
    document.head.append(script)
  })
  return loadPromise
}

onMounted(async () => {
  try {
    const turnstile = await loadTurnstile()
    if (!container.value) return
    widgetId = turnstile.render(container.value, {
      sitekey: props.siteKey,
      action: 'booking',
      callback: (token) => emit('verified', token),
      'expired-callback': () => emit('verified', ''),
      'error-callback': () => {
        emit('verified', '')
        emit('error', 'Verifikasi keamanan gagal dimuat. Muat ulang halaman dan coba kembali.')
      },
    })
  } catch (error) {
    emit('error', error.message)
  }
})

onUnmounted(() => {
  if (widgetId !== undefined) window.turnstile?.remove(widgetId)
})
</script>

<template>
  <div ref="container" class="mt-4 min-h-[65px]" />
</template>
