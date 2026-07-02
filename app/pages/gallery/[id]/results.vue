<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { BatchDetail, BatchRun, ResultFile, ResultsResponse } from '~/types/gallery'
import { batchSubtitle, batchTitle } from '~/utils/gallery'

const route = useRoute()
const { t, locale } = useI18n()

interface PresetParam {
  nodeId: string
  inputName: string
  runtimeInput?: boolean
}

interface PresetDetail {
  id: string
  nodeParams: PresetParam[]
}

const batchId = computed(() => String(route.params.id || ''))
const loading = ref(false)
const batch = ref<BatchRun | null>(null)
const results = ref<ResultFile[]>([])
const preset = ref<PresetDetail | null>(null)

const runtimeParamOrder = computed(() => {
  return preset.value?.nodeParams
    .filter(param => param.runtimeInput)
    .map(param => `${param.nodeId}.${param.inputName}`) ?? []
})

async function fetchBatchMeta() {
  const detail = await $fetch<BatchDetail>(`/api/v1/batch/${batchId.value}?taskLimit=1&taskOffset=0`)
  batch.value = detail
  preset.value = detail.presetId
    ? await $fetch<PresetDetail>(`/api/v1/presets/${detail.presetId}`)
    : null
}

async function fetchResults() {
  if (!batchId.value) return
  loading.value = true
  try {
    await fetchBatchMeta()
    const params = new URLSearchParams({
      batchRunId: batchId.value,
      limit: '10000',
      offset: '0',
      includeTaskParams: 'true'
    })
    const response = await $fetch<ResultsResponse>(`/api/v1/results?${params}`)
    results.value = response.results
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('gallery.fetchResultsFailed'))
  } finally {
    loading.value = false
  }
}

function downloadResult(id: string) {
  globalThis.window?.open(`/api/v1/results/${id}/file?download`)
}

function backToQueue() {
  void navigateTo('/gallery')
}

function openDetail() {
  void navigateTo(`/gallery/${batchId.value}/detail`)
}

onMounted(fetchResults)
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('gallery.resultTitle') }}</h1>
        <p class="fm-page-subtitle">{{ t('gallery.resultSubtitle') }}</p>
      </div>
      <div class="actions">
        <ElButton @click="backToQueue">
          <FmIcon name="arrowLeft" :size="16" />
          {{ t('gallery.backToList') }}
        </ElButton>
        <ElButton @click="openDetail">{{ t('gallery.detail') }}</ElButton>
        <ElButton :loading="loading" type="primary" @click="fetchResults">{{ t('gallery.refreshResults') }}</ElButton>
      </div>
    </div>

    <div class="detail-header fm-card">
      <div>
        <h2>{{ batch ? batchTitle(batch, t, locale) : t('gallery.resultTitle') }}</h2>
        <span>{{ batch ? batchSubtitle(batch, t, locale) : batchId }}</span>
      </div>
    </div>

    <section v-loading="loading">
      <GalleryResultMatrix :results="results" :param-order="runtimeParamOrder" @download="downloadResult" />
    </section>
  </section>
</template>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-header h2 {
  margin: 0 0 4px;
  color: var(--fm-text);
  font-size: 18px;
}

.detail-header span {
  color: var(--fm-muted);
  font-size: 12px;
}

</style>

