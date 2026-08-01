<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { BatchDetail, BatchRun, ResultFile, ResultsResponse } from '~/types/gallery'
import { batchProgress, batchSubtitle, batchTitle, isOnlineApiPreset, statusLabel, statusType } from '~/utils/gallery'

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
const refreshing = ref(false)
const exporting = ref(false)
const canceling = ref(false)
const loadError = ref('')
const batch = ref<BatchRun | null>(null)
const results = ref<ResultFile[]>([])
const preset = ref<PresetDetail | null>(null)
const loadedPresetId = ref('')
let pollingTimer: ReturnType<typeof setInterval> | null = null
const hasResults = computed(() => results.value.length > 0)
const isActive = computed(() => batch.value?.status === 'queued' || batch.value?.status === 'running')

const runtimeParamOrder = computed(() => {
  return preset.value?.nodeParams
    .filter(param => param.runtimeInput)
    .map(param => `${param.nodeId}.${param.inputName}`) ?? []
})

async function fetchBatchMeta() {
  const detail = await $fetch<BatchDetail>(`/api/v1/batch/${batchId.value}?taskLimit=1&taskOffset=0`)
  batch.value = detail
  if (loadedPresetId.value !== detail.presetId) {
    preset.value = detail.presetId && !isOnlineApiPreset(detail.presetId)
      ? await $fetch<PresetDetail>(`/api/v1/presets/${detail.presetId}`)
      : null
    loadedPresetId.value = detail.presetId
  }
}

async function fetchResults(quiet = false) {
  if (!batchId.value) return
  if (refreshing.value) return
  refreshing.value = true
  if (!quiet) loading.value = true
  loadError.value = ''
  try {
    await fetchBatchMeta()
    const offset = quiet ? results.value.length : 0
    const params = new URLSearchParams({
      batchRunId: batchId.value,
      limit: '10000',
      offset: String(offset),
      includeTaskParams: 'true'
    })
    const response = await $fetch<ResultsResponse>(`/api/v1/results?${params}`)
    if (quiet) {
      const existingIds = new Set(results.value.map(result => result.id))
      results.value = [...results.value, ...response.results.filter(result => !existingIds.has(result.id))]
    } else {
      results.value = response.results
    }
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : t('gallery.fetchResultsFailed')
  } finally {
    if (!quiet) loading.value = false
    refreshing.value = false
  }
}

function downloadResult(id: string) {
  globalThis.window?.open(`/api/v1/results/${id}/file?download`)
}

async function exportAll() {
  if (!batchId.value) return
  exporting.value = true
  try {
    const url = `/api/v1/results/export-all?batchRunId=${batchId.value}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Export failed')
    }
    const blob = await response.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `export-${batchId.value.slice(0, 8)}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
    ElMessage.success(t('gallery.exportSuccess'))
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('gallery.exportFailed'))
  } finally {
    exporting.value = false
  }
}

function backToQueue() {
  void navigateTo('/gallery')
}

function openDetail() {
  void navigateTo(`/gallery/${batchId.value}/detail`)
}

async function cancelBatch() {
  if (!batch.value || !isActive.value) return
  try {
    await ElMessageBox.confirm(t('runDetail.cancelConfirm'), t('runDetail.cancelTitle'), { type: 'warning' })
    canceling.value = true
    await $fetch(`/api/v1/batch/${batch.value.id}/cancel`, { method: 'POST' })
    ElMessage.success(t('runDetail.cancelSent'))
    await fetchResults(true)
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : t('runDetail.cancelFailed'))
  } finally {
    canceling.value = false
  }
}

function startPolling() {
  if (pollingTimer || !isActive.value || document.hidden) return
  pollingTimer = setInterval(() => {
    void fetchResults(true)
  }, 3000)
}

function stopPolling() {
  if (!pollingTimer) return
  clearInterval(pollingTimer)
  pollingTimer = null
}

function syncPolling() {
  if (isActive.value && !document.hidden) startPolling()
  else stopPolling()
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopPolling()
    return
  }
  void fetchResults(true)
  startPolling()
}

watch(isActive, syncPolling)

onMounted(async () => {
  await fetchResults()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  syncPolling()
})

onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('gallery.resultTitle') }}</h1>
        <p class="fm-page-subtitle">{{ t('gallery.resultSubtitle') }}</p>
      </div>
      <div class="actions result-actions">
        <ElButton text @click="backToQueue">
          <FmIcon name="arrowLeft" :size="16" />
          {{ t('gallery.backToList') }}
        </ElButton>
        <ElButton @click="openDetail">{{ t('gallery.detail') }}</ElButton>
        <ElButton
          v-if="isActive"
          type="danger"
          plain
          :loading="canceling"
          @click="cancelBatch"
        >{{ t('runDetail.cancelUnfinished') }}</ElButton>
        <ElButton :loading="exporting" :disabled="!hasResults || loading" @click="exportAll">{{ t('gallery.exportAll') }}</ElButton>
        <ElButton :loading="loading" type="primary" @click="fetchResults()">{{ t('gallery.refreshResults') }}</ElButton>
      </div>
    </div>

    <div class="detail-header fm-card">
      <div>
        <h2>{{ batch ? batchTitle(batch, t, locale) : t('gallery.resultTitle') }}</h2>
        <span>{{ batch ? batchSubtitle(batch, t, locale) : batchId }}</span>
      </div>
      <div v-if="batch" class="result-overview" aria-live="polite">
        <div>
          <span>{{ t('gallery.generatedFiles') }}</span>
          <strong>{{ results.length }}</strong>
        </div>
        <div>
          <span>{{ t('gallery.progress') }}</span>
          <strong>{{ batchProgress(batch) }}%</strong>
        </div>
        <ElTag :type="statusType(batch.status)" effect="light">{{ statusLabel(batch.status, t) }}</ElTag>
      </div>
    </div>

    <ElAlert
      v-if="loadError"
      :title="t('gallery.fetchResultsFailed')"
      :description="loadError"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default>
        <ElButton size="small" @click="fetchResults()">{{ t('common.retry') }}</ElButton>
      </template>
    </ElAlert>

    <ElAlert
      v-if="isActive"
      :title="t('gallery.resultsGenerating')"
      :description="t('gallery.resultsGeneratingHint', { count: results.length })"
      type="info"
      show-icon
      :closable="false"
      class="results-live-alert"
    />

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

.result-overview {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}

.result-overview div {
  display: grid;
  gap: 3px;
  text-align: right;
}

.result-overview strong {
  color: var(--fm-text);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.results-live-alert {
  margin: 0;
}

@media (max-width: 760px) {
  .detail-header,
  .result-overview {
    align-items: flex-start;
    flex-direction: column;
  }

  .result-overview {
    gap: 8px;
  }

  .result-overview div {
    display: flex;
    gap: 8px;
    text-align: left;
  }

  .result-actions {
    width: 100%;
  }

  .result-actions :deep(.el-button) {
    flex: 1 1 auto;
  }
}

</style>

