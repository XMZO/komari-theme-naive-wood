<script setup lang="ts">
import type { ByteDecimalsConfig } from '@/utils/helper'
import { computed } from 'vue'
import { formatBytesWithConfig } from '@/utils/helper'
import { useDraft } from '../context'

const { draft } = useDraft()

const SAMPLES = [
  { label: '512 字节', bytes: 512 },
  { label: '2.4 KB', bytes: 2458 },
  { label: '37.6 MB', bytes: 39_426_458 },
  { label: '1.45 GB', bytes: 1_556_925_644 },
  { label: '3.27 TB', bytes: 3_595_398_918_717 },
]

const config = computed<ByteDecimalsConfig>(() => ({
  B: Number(draft.value.byteDecimalsB),
  KB: Number(draft.value.byteDecimalsKB),
  MB: Number(draft.value.byteDecimalsMB),
  GB: Number(draft.value.byteDecimalsGB),
  TB: Number(draft.value.byteDecimalsTB),
}))

const rows = computed(() => SAMPLES.map(sample => ({
  label: sample.label,
  value: formatBytesWithConfig(sample.bytes, config.value),
})))
</script>

<template>
  <div class="byte-sample">
    <span class="byte-sample__title">效果</span>
    <div class="byte-sample__list">
      <div v-for="row in rows" :key="row.label" class="byte-sample__item">
        <span class="byte-sample__raw">{{ row.label }}</span>
        <span class="byte-sample__value">{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.byte-sample {
  display: flex;
  flex-direction: column;
  gap: 8px;
  grid-column: 1 / -1;
  padding: 12px 14px;
  border-top: 1px solid var(--s-border);
}

.byte-sample__title {
  color: var(--s-text-3);
  font-size: 12px;
}

.byte-sample__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.byte-sample__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--s-subtle);
}

.byte-sample__raw {
  color: var(--s-text-3);
  font-size: 11.5px;
}

.byte-sample__value {
  font-family: 'TCloud Number VF', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 500;
}
</style>
