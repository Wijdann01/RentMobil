<script setup>
import { Menu, X, CarFront, ArrowUpRight } from '@lucide/vue'
import { ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const menuOpen = ref(false)
const route = useRoute()
</script>

<template>
  <div v-if="route.path !== '/dashboard'" class="min-h-screen">
    <header class="container-wide relative z-20 flex h-[82px] items-center justify-between">
      <RouterLink to="/" class="flex items-center gap-2.5" @click="menuOpen = false">
        <span class="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#244b3b] text-white"><CarFront :size="23" /></span>
        <span class="font-display text-[21px] font-extrabold tracking-[-1px]">jalanin<span class="text-[#84a88b]">.</span></span>
      </RouterLink>
      <nav class="hidden items-center gap-9 text-sm font-medium text-[#5f6b63] md:flex">
        <RouterLink to="/#armada" class="transition hover:text-[#244b3b]">Pilihan mobil</RouterLink>
        <RouterLink to="/#layanan" class="transition hover:text-[#244b3b]">Layanan</RouterLink>
        <RouterLink to="/#tentang" class="transition hover:text-[#244b3b]">Tentang kami</RouterLink>
      </nav>
      <RouterLink to="/dashboard" class="hidden items-center gap-2 rounded-full bg-[#244b3b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18392c] md:flex">
        Dashboard <ArrowUpRight :size="16" />
      </RouterLink>
      <button class="rounded-lg p-2 text-[#244b3b] md:hidden" aria-label="Buka menu" @click="menuOpen = !menuOpen">
        <X v-if="menuOpen" :size="22" /><Menu v-else :size="22" />
      </button>
      <nav v-if="menuOpen" class="absolute left-0 right-0 top-[72px] flex flex-col gap-4 rounded-2xl border border-[#e9ebe6] bg-white p-5 text-sm font-medium shadow-xl md:hidden">
        <RouterLink to="/#armada" @click="menuOpen = false">Pilihan mobil</RouterLink>
        <RouterLink to="/#layanan" @click="menuOpen = false">Layanan</RouterLink>
        <RouterLink to="/#tentang" @click="menuOpen = false">Tentang kami</RouterLink>
        <RouterLink to="/dashboard" @click="menuOpen = false">Dashboard admin →</RouterLink>
      </nav>
    </header>
    <RouterView />
  </div>
  <RouterView v-else />
</template>
