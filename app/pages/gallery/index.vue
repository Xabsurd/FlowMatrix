<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { BatchDetail, BatchRun, Task } from '~/types/gallery'
import {
  batchProgress,
  batchSubtitle,
  batchTitle,
  completedCount,
  COPIED_TASK_STORAGE_KEY,
  isOnlineApiPreset,
  statusLabel,
  statusType,
  visibleInputParams
} from '~/utils/gallery'

const route = useRoute()
const { t, locale } = useI18n()
const { rowActionSize } = useUiPreferences()

const batchRuns = ref<BatchRun[]>([])
const loading = ref(false)
const refreshing = ref(false)
const copyingBatchId = ref('')
const cancelingBatchId = ref('')
const selectedBatchIds = ref<string[]>([])
const selectMode = ref(false)
const page = ref(1)
const limit = 50
let pollingTimer: ReturnType<typeof setInterval> | null = null

const hasNextPage = computed(() => batchRuns.value.length === limit)
const hasActiveRuns = computed(() => batchRuns.value.some(batch => isActiveBatch(batch)))
const allVisibleSelected = computed(() => batchRuns.value.length > 0
  && batchRuns.value.every(batch => selectedBatchIds.value.includes(batch.id)))
const selectedDeletableCount = computed(() => batchRuns.value.filter(batch =>
  selectedBatchIds.value.includes(batch.id) && batch.status !== 'queued' && batch.status !== 'running'
).length)

async function fetchBatchRuns(quiet = false) {
  if (refreshing.value) return
  refreshing.value = true
  if (!quiet) loading.value = true
  try {
    const offset = (page.value - 1) * limit
    batchRuns.value = await $fetch<BatchRun[]>(`/api/v1/batch?limit=${limit}&offset=${offset}`)
  } catch (error: unknown) {
    if (!quiet) ElMessage.error(error instanceof Error ? error.message : t('gallery.fetchQueueFailed'))
  } finally {
    if (!quiet) loading.value = false
    refreshing.value = false
  }
}

async function fetchAllTasks(batchId: string) {
  const pageSize = 100
  let offset = 0
  let allTasks: Task[] = []
  while (true) {
    const detail = await $fetch<BatchDetail>(`/api/v1/batch/${batchId}?taskLimit=${pageSize}&taskOffset=${offset}`)
    allTasks = allTasks.concat(detail.tasks)
    if (allTasks.length >= detail.taskPage.total || detail.tasks.length < pageSize) break
    offset += pageSize
  }
  return allTasks
}

function isActiveBatch(batch: Pick<BatchRun, 'status'>) {
  return batch.status === 'queued' || batch.status === 'running'
}

function openPrimary(batch: BatchRun) {
  if (selectMode.value) {
    toggleBatchSelection(batch.id)
    return
  }
  void navigateTo(isActiveBatch(batch)
    ? `/gallery/${batch.id}/detail`
    : `/gallery/${batch.id}/results`)
}

function openResults(batchId: string) {
  if (selectMode.value) {
    toggleBatchSelection(batchId)
    return
  }
  void navigateTo(`/gallery/${batchId}/results`)
}

function openDetail(batchId: string) {
  if (selectMode.value) {
    toggleBatchSelection(batchId)
    return
  }
  void navigateTo(`/gallery/${batchId}/detail`)
}

async function copyBatchFirstTask(batch: BatchRun) {
  copyingBatchId.value = batch.id
  try {
    const tasks = await fetchAllTasks(batch.id)
    if (!tasks.length) {
      ElMessage.warning(t('gallery.noCopyableTask'))
      return
    }
    // Collect all unique values per parameter across all tasks
    const firstTask = tasks[0]!
    const presetId = firstTask.presetId
    if (isOnlineApiPreset(presetId)) {
      ElMessage.info(t('gallery.onlineCopyUnavailable'))
      return
    }
    const allInputParams: Record<string, unknown[]> = {}
    for (const task of tasks) {
      for (const [key, value] of visibleInputParams(task.inputParams)) {
        if (!allInputParams[key]) allInputParams[key] = []
        const json = JSON.stringify(value)
        if (!allInputParams[key].some(v => JSON.stringify(v) === json)) {
          allInputParams[key].push(value)
        }
      }
    }
    sessionStorage.setItem(COPIED_TASK_STORAGE_KEY, JSON.stringify({
      presetId,
      inputParams: allInputParams
    }))
    ElMessage.success(t('gallery.copiedParamsBack', { count: Object.keys(allInputParams).length }))
    void navigateTo(`/runs?presetId=${presetId}`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('gallery.copyFailed'))
  } finally {
    copyingBatchId.value = ''
  }
}

async function deleteBatchRun(batch: BatchRun) {
  if (batch.status === 'queued' || batch.status === 'running') {
    ElMessage.warning(t('gallery.cancelBeforeDelete'))
    return
  }

  try {
    await ElMessageBox.confirm(t('gallery.deleteBatchConfirm', { name: batchTitle(batch, t, locale.value) }), t('gallery.deleteBatchTitle'), { type: 'warning' })
    await $fetch(`/api/v1/batch/${batch.id}`, { method: 'DELETE' })
    selectedBatchIds.value = selectedBatchIds.value.filter(id => id !== batch.id)
    await fetchBatchRuns(true)
    ElMessage.success(t('gallery.deletedBatch'))
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : t('gallery.deleteFailed'))
  }
}

async function cancelBatchRun(batch: BatchRun) {
  cancelingBatchId.value = batch.id
  try {
    await ElMessageBox.confirm(t('runDetail.cancelConfirm'), t('runDetail.cancelTitle'), { type: 'warning' })
    await $fetch(`/api/v1/batch/${batch.id}/cancel`, { method: 'POST' })
    ElMessage.success(t('runDetail.cancelSent'))
    await fetchBatchRuns(true)
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : t('runDetail.cancelFailed'))
  } finally {
    cancelingBatchId.value = ''
  }
}

async function deleteSelectedBatches() {
  const deletable = batchRuns.value.filter(batch =>
    selectedBatchIds.value.includes(batch.id) && batch.status !== 'queued' && batch.status !== 'running'
  )
  if (!deletable.length) {
    ElMessage.warning(t('gallery.noDeletableSelection'))
    return
  }

  try {
    await ElMessageBox.confirm(t('gallery.deleteSelectedConfirm', { count: deletable.length }), t('gallery.deleteSelectedTitle'), { type: 'warning' })
    await Promise.all(deletable.map(batch => $fetch(`/api/v1/batch/${batch.id}`, { method: 'DELETE' })))
    selectedBatchIds.value = []
    selectMode.value = false
    await fetchBatchRuns(true)
    ElMessage.success(t('gallery.deletedSelected', { count: deletable.length }))
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : t('gallery.deleteSelectedFailed'))
  }
}

function handlePageChange(nextPage: number) {
  page.value = nextPage
  selectedBatchIds.value = []
  void fetchBatchRuns()
}

function toggleBatchSelection(batchRunId: string) {
  if (!selectMode.value) return
  const index = selectedBatchIds.value.indexOf(batchRunId)
  if (index >= 0) selectedBatchIds.value.splice(index, 1)
  else selectedBatchIds.value.push(batchRunId)
}

function isBatchSelected(batchRunId: string) {
  return selectedBatchIds.value.includes(batchRunId)
}

function cancelSelection() {
  selectedBatchIds.value = []
  selectMode.value = false
}

function toggleSelectAllVisible() {
  selectedBatchIds.value = allVisibleSelected.value ? [] : batchRuns.value.map(batch => batch.id)
}

function startPolling() {
  if (pollingTimer || !hasActiveRuns.value || document.hidden) return
  pollingTimer = setInterval(() => {
    void fetchBatchRuns(true)
  }, 3000)
}

function stopPolling() {
  if (!pollingTimer) return
  clearInterval(pollingTimer)
  pollingTimer = null
}

function syncPolling() {
  if (hasActiveRuns.value && !document.hidden) startPolling()
  else stopPolling()
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopPolling()
    return
  }
  void fetchBatchRuns(true)
  startPolling()
}

watch(hasActiveRuns, syncPolling)

onMounted(async () => {
  if (typeof route.query.batchRunId === 'string') {
    await navigateTo(`/gallery/${route.query.batchRunId}/detail`, { replace: true })
    return
  }
  await fetchBatchRuns()
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
        <h1 class="fm-page-title">{{ t('gallery.title') }}</h1>
        <p class="fm-page-subtitle">
          {{ selectMode ? t('gallery.selectSubtitle') : t('gallery.subtitle') }}
        </p>
      </div>
      <div class="actions">
        <ElButton v-if="!selectMode" :disabled="batchRuns.length === 0" @click="selectMode = true">{{ t('gallery.batchManage') }}</ElButton>
        <ElButton v-else @click="cancelSelection">{{ t('gallery.exitBatchManage') }}</ElButton>
        <ElButton :loading="loading" type="primary" @click="fetchBatchRuns()">{{ t('common.refresh') }}</ElButton>
      </div>
    </div>

    <section v-loading="loading" class="fm-card fm-stack">
      <div class="fm-section-head">
        <div>
          <h2>{{ t('gallery.queueTitle') }}</h2>
          <span>{{ t('gallery.queueHint') }}</span>
        </div>
        <div class="queue-head-actions">
          <ElTag v-if="hasActiveRuns" type="primary" effect="plain" aria-live="polite">
            {{ t('gallery.autoRefreshing') }}
          </ElTag>
          <div v-if="selectMode" class="selection-actions">
            <span>{{ t('gallery.selectedCount', { count: selectedBatchIds.length }) }}</span>
            <ElButton :size="rowActionSize" @click="toggleSelectAllVisible">
              {{ allVisibleSelected ? t('gallery.clearSelection') : t('gallery.selectAllVisible') }}
            </ElButton>
            <ElButton
              type="danger"
              plain
              :size="rowActionSize"
              :disabled="selectedDeletableCount === 0"
              @click="deleteSelectedBatches"
            >
              {{ t('gallery.deleteSelectedWithCount', { count: selectedDeletableCount }) }}
            </ElButton>
          </div>
        </div>
      </div>

      <div v-if="batchRuns.length" class="fm-stack-sm">
        <article
          v-for="batch in batchRuns"
          :key="batch.id"
          class="queue-batch"
          :class="{ selected: isBatchSelected(batch.id), selecting: selectMode }"
          role="button"
          tabindex="0"
          @click="openPrimary(batch)"
          @keydown.enter.prevent="openPrimary(batch)"
          @keydown.space.prevent="openPrimary(batch)"
        >
          <span v-if="selectMode" class="batch-select-indicator">
            <span v-if="isBatchSelected(batch.id)">✓</span>
          </span>

          <div class="queue-title">
            <strong>{{ batchTitle(batch, t, locale) }}</strong>
            <span>{{ batchSubtitle(batch, t, locale) }}</span>
          </div>

          <div class="queue-progress">
            <ElProgress
              :percentage="batchProgress(batch)"
              :status="batch.status === 'failed' ? 'exception' : batch.status === 'completed' ? 'success' : undefined"
              :stroke-width="8"
              :show-text="false" />
            <small>{{ completedCount(batch) }} / {{ batch.totalTasks }}</small>
          </div>

          <div class="queue-stats">
            <span>{{ t('gallery.succeededCount', { count: batch.completedTasks }) }}</span>
            <span>{{ t('gallery.failedCount', { count: batch.failedTasks }) }}</span>
          </div>

          <ElTag :type="statusType(batch.status)" size="small" effect="light">{{ statusLabel(batch.status, t) }}</ElTag>

          <div v-if="!selectMode" class="fm-actions">
            <ElButton :size="rowActionSize" type="primary" @click.stop="openPrimary(batch)">
              {{ isActiveBatch(batch) ? t('gallery.progress') : t('gallery.result') }}
            </ElButton>
            <ElButton :size="rowActionSize" @click.stop="isActiveBatch(batch) ? openResults(batch.id) : openDetail(batch.id)">
              {{ isActiveBatch(batch) ? t('gallery.result') : t('gallery.detail') }}
            </ElButton>
            <ElButton :size="rowActionSize" :loading="copyingBatchId === batch.id" @click.stop="copyBatchFirstTask(batch)">{{ t('gallery.copy') }}</ElButton>
            <ElButton
              v-if="batch.status === 'queued' || batch.status === 'running'"
              :size="rowActionSize"
              type="danger"
              plain
              :loading="cancelingBatchId === batch.id"
              @click.stop="cancelBatchRun(batch)"
            >{{ t('common.cancel') }}</ElButton>
            <ElButton
              :size="rowActionSize"
              type="danger"
              plain
              :disabled="batch.status === 'queued' || batch.status === 'running'"
              @click.stop="deleteBatchRun(batch)"
            >{{ t('common.delete') }}</ElButton>
          </div>
        </article>
      </div>
      <ElEmpty v-else :description="t('gallery.emptyQueue')">
        <ElButton type="primary" @click="navigateTo('/runs')">{{ t('gallery.createRun') }}</ElButton>
      </ElEmpty>

      <div v-if="page > 1 || hasNextPage" class="pagination-row">
        <ElButton :disabled="page <= 1" @click="handlePageChange(page - 1)">{{ t('gallery.previousPage') }}</ElButton>
        <span>{{ t('gallery.page', { page }) }}</span>
        <ElButton :disabled="!hasNextPage" @click="handlePageChange(page + 1)">{{ t('gallery.nextPage') }}</ElButton>
      </div>
    </section>
  </section>
</template>

<style scoped lang="scss">
.fm-section-head h2 {
  margin: 0;
  color: var(--fm-text);
  font-size: 17px;
}

.fm-section-head span {
  color: var(--fm-muted);
  font-size: 12px;
}

.queue-batch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 176px 112px 86px auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 68%, transparent);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.queue-batch:focus-visible {
  border-color: color-mix(in srgb, var(--fm-primary) 62%, var(--fm-border));
  outline: 2px solid color-mix(in srgb, var(--fm-primary) 28%, transparent);
  outline-offset: 2px;
}

.queue-batch.selecting {
  grid-template-columns: 24px minmax(0, 1fr) 176px 112px 86px;
  cursor: pointer;
}

.queue-batch:hover {
  border-color: color-mix(in srgb, var(--fm-primary) 38%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 7%, var(--fm-panel-muted));
}

.queue-batch.selected {
  border-color: color-mix(in srgb, var(--fm-primary) 62%, var(--fm-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--fm-primary) 24%, transparent);
}

.batch-select-indicator {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid color-mix(in srgb, var(--fm-primary) 72%, white);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.queue-batch.selected .batch-select-indicator {
  background: var(--fm-primary);
  border-color: var(--fm-primary);
}

.queue-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.queue-title strong {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-title span,
.queue-progress small,
.queue-stats {
  color: var(--fm-muted);
  font-size: 12px;
}

.selection-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.queue-head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.queue-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.queue-progress :deep(.el-progress),
.queue-progress :deep(.el-progress-bar) {
  min-width: 0;
  padding-right: 0;
  margin-right: 0;
}

.queue-progress small {
  white-space: nowrap;
}

.queue-stats {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 12px;
  color: var(--fm-muted);
  font-size: 12px;
}

@media (max-width: 1180px) {
  .queue-batch,
  .queue-batch.selecting {
    grid-template-columns: 1fr;
    justify-items: stretch;
  }

  .queue-stats,
  .fm-actions,
  .fm-section-head {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>


