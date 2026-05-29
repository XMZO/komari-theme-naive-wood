<script setup lang="ts">
export type AppIconName = 'dark-mode' | 'sun-one' | 'moon' | 'setting' | 'login' | 'view-grid-card' | 'view-list' | 'download'

defineProps<{
  name: AppIconName
}>()
</script>

<template>
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g v-if="name === 'dark-mode'" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="4">
      <path d="m24.003 4l5.27 5.27h9.457v9.456l5.27 5.27l-5.27 5.278v9.456h-9.456L24.004 44l-5.278-5.27H9.27v-9.456L4 23.997l5.27-5.27V9.27h9.456z" />
      <path d="M27 17c0 8-5 9-10 9c0 4 6.5 8 12 4s2-13-2-13" />
    </g>
    <g v-else-if="name === 'sun-one'">
      <path stroke="currentColor" stroke-linejoin="round" stroke-width="4" d="M24 37c7.18 0 13-5.82 13-13s-5.82-13-13-13s-13 5.82-13 13s5.82 13 13 13Z" />
      <path fill="currentColor" d="M24 6a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m14.5 6a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m6 14.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m-6 14.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5M24 47a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5M9.5 41a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m-6-14.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m6-14.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5" />
    </g>
    <path v-else-if="name === 'moon'" stroke="currentColor" stroke-linejoin="round" stroke-width="4" d="M28.053 4.41c-5.47 1.427-9.507 6.4-9.507 12.317c0 7.03 5.698 12.728 12.727 12.728c5.916 0 10.89-4.038 12.316-9.508A20 20 0 0 1 44 24c0 11.046-8.954 20-20 20S4 35.046 4 24S12.954 4 24 4c1.389 0 2.744.141 4.053.41Z" />
    <g v-else-if="name === 'setting'" stroke="currentColor" stroke-linejoin="round" stroke-width="4">
      <path d="M36.686 15.171a15.4 15.4 0 0 1 2.529 6.102H44v5.454h-4.785a15.4 15.4 0 0 1-2.529 6.102l3.385 3.385l-3.857 3.857l-3.385-3.385a15.4 15.4 0 0 1-6.102 2.529V44h-5.454v-4.785a15.4 15.4 0 0 1-6.102-2.529l-3.385 3.385l-3.857-3.857l3.385-3.385a15.4 15.4 0 0 1-2.529-6.102H4v-5.454h4.785a15.4 15.4 0 0 1 2.529-6.102l-3.385-3.385l3.857-3.857l3.385 3.385a15.4 15.4 0 0 1 6.102-2.529V4h5.454v4.785a15.4 15.4 0 0 1 6.102 2.529l3.385-3.385l3.857 3.857z" />
      <path d="M24 29a5 5 0 1 0 0-10a5 5 0 0 0 0 10Z" />
    </g>
    <g v-else-if="name === 'login'" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">
      <path d="M23.992 6H6v36h18" />
      <path d="m25 33l-9-9l9-9m17 8.992H16" />
    </g>
    <g v-else-if="name === 'view-grid-card'" stroke="currentColor" stroke-linejoin="round" stroke-width="4">
      <rect width="36" height="36" x="6" y="6" rx="3" />
      <path d="M13 13h8v8h-8zm14 0h8v8h-8zM13 27h8v8h-8zm14 0h8v8h-8z" />
    </g>
    <g v-else-if="name === 'view-list'">
      <rect width="32" height="40" x="8" y="4" stroke="currentColor" stroke-linejoin="round" stroke-width="4" rx="2" />
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M21 14h12M21 24h12M21 34h12" />
      <path fill="currentColor" fill-rule="evenodd" d="M15 16a2 2 0 1 0 0-4a2 2 0 0 0 0 4m0 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4m0 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4" clip-rule="evenodd" />
    </g>
    <g v-else-if="name === 'download'" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">
      <path d="M6 24.008V42h36V24" />
      <path d="m33 23l-9 9l-9-9m8.992-17v26" />
    </g>
  </svg>
</template>
