<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { BatchDetail, BatchRun, Task } from '~/types/gallery'
import {
  batchProgress,
  batchSubtitle,
  batchTitle,
  completedCount,
  COPIED_TASK_STORAGE_KEY,
  statusLabel,
  statusType,
  visibleInputParams
} from '~/utils/gallery'

const route = useRoute()
const { rowActionSize } = useUiPreferences()

const batchRuns = ref<BatchRun[]>([])
const loading = ref(false)
const copyingBatchId = ref('')
const selectedBatchIds = ref<string[]>([])
const selectMode = ref(false)
const page = ref(1)
const limit = 50

const hasNextPage = computed(() => batchRuns.value.length === limit)

async function fetchBatchRuns(quiet = false) {
  if (!quiet) loading.value = true
  try {
    const offset = (page.value - 1) * limit
    batchRuns.value = await $fetch<BatchRun[]>(`/api/v1/batch?limit=${limit}&offset=${offset}`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '获取运行队列失败')
  } finally {
    if (!quiet) loading.value = false
  }
}

async function fetchFirstTask(batchId: string) {
  const detail = await $fetch<BatchDetail>(`/api/v1/batch/${batchId}?taskLimit=1&taskOffset=0`)
  return detail.tasks[0] || null
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
    const task = await fetchFirstTask(batch.id)
    if (!task) {
      ElMessage.warning('这个批次没有可复制的任务')
      return
    }
    copyTaskToRun(task)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '复制任务失败')
  } finally {
    copyingBatchId.value = ''
  }
}

function copyTaskToRun(task: Task) {
  if (!import.meta.client) return
  sessionStorage.setItem(COPIED_TASK_STORAGE_KEY, JSON.stringify({
    presetId: task.presetId,
    inputParams: Object.fromEntries(visibleInputParams(task.inputParams))
  }))
  ElMessage.success('已复制任务参数，正在返回运行页')
  void navigateTo(`/runs?presetId=${task.presetId}`)
}

async function deleteBatchRun(batch: BatchRun) {
  if (batch.status === 'queued' || batch.status === 'running') {
    ElMessage.warning('请先取消运行中的队列，再删除')
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除「${batchTitle(batch)}」？相关任务记录和结果文件也会一起删除。`, '删除运行队列', { type: 'warning' })
    await $fetch(`/api/v1/batch/${batch.id}`, { method: 'DELETE' })
    selectedBatchIds.value = selectedBatchIds.value.filter(id => id !== batch.id)
    await fetchBatchRuns(true)
    ElMessage.success('运行队列已删除')
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

async function deleteSelectedBatches() {
  const deletable = batchRuns.value.filter(batch =>
    selectedBatchIds.value.includes(batch.id) && batch.status !== 'queued' && batch.status !== 'running'
  )
  if (!deletable.length) {
    ElMessage.warning('选中的批次都还在运行或排队，不能直接删除')
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除 ${deletable.length} 个已结束批次？相关任务记录和结果文件也会一起删除。`, '批量删除运行队列', { type: 'warning' })
    await Promise.all(deletable.map(batch => $fetch(`/api/v1/batch/${batch.id}`, { method: 'DELETE' })))
    selectedBatchIds.value = []
    selectMode.value = false
    await fetchBatchRuns(true)
    ElMessage.success(`已删除 ${deletable.length} 个批次`)
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '批量删除失败')
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

onMounted(async () => {
  if (typeof route.query.batchRunId === 'string') {
    await navigateTo(`/gallery/${route.query.batchRunId}/results`, { replace: true })
    return
  }
  await fetchBatchRuns()
})
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">运行与结果</h1>
        <p class="fm-page-subtitle">
          {{ selectMode ? '批量管理模式：点击批次选择整条运行记录，再统一删除。' : '运行队列就是结果入口，批次结束后从这里直接查看产物。' }}
        </p>
      </div>
      <div class="actions">
        <ElButton v-if="!selectMode" :disabled="batchRuns.length === 0" @click="selectMode = true">批量管理</ElButton>
        <ElButton v-else @click="cancelSelection">退出批量</ElButton>
        <ElButton :loading="loading" type="primary" @click="fetchBatchRuns()">刷新</ElButton>
      </div>
    </div>

    <section v-loading="loading" class="fm-card fm-stack">
      <div class="fm-section-head">
        <div>
          <h2>运行队列</h2>
          <span>点击整行查看结果；详情按钮进入执行详情。</span>
        </div>
        <ElButton
          v-if="selectMode"
          type="danger"
          plain
          :disabled="selectedBatchIds.length === 0"
          @click="deleteSelectedBatches"
        >
          删除选中
        </ElButton>
      </div>

      <div v-if="batchRuns.length" class="fm-stack-sm">
        <article
          v-for="batch in batchRuns"
          :key="batch.id"
          class="queue-batch"
          :class="{ selected: isBatchSelected(batch.id), selecting: selectMode }"
          @click="openResults(batch.id)"
        >
          <span v-if="selectMode" class="batch-select-indicator">
            <span v-if="isBatchSelected(batch.id)">✓</span>
          </span>

          <div class="queue-title">
            <strong>{{ batchTitle(batch) }}</strong>
            <span>{{ batchSubtitle(batch) }}</span>
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
            <span>成功 {{ batch.completedTasks }}</span>
            <span>失败 {{ batch.failedTasks }}</span>
          </div>

          <ElTag :type="statusType(batch.status)" size="small" effect="light">{{ statusLabel(batch.status) }}</ElTag>

          <div class="fm-actions">
            <ElButton :size="rowActionSize" type="primary" @click.stop="openResults(batch.id)">结果</ElButton>
            <ElButton :size="rowActionSize" @click.stop="openDetail(batch.id)">详情</ElButton>
            <ElButton :size="rowActionSize" :loading="copyingBatchId === batch.id" @click.stop="copyBatchFirstTask(batch)">复制</ElButton>
            <ElButton
              :size="rowActionSize"
              type="danger"
              plain
              :disabled="batch.status === 'queued' || batch.status === 'running'"
              @click.stop="deleteBatchRun(batch)"
            >
              删除
            </ElButton>
          </div>
        </article>
      </div>
      <ElEmpty v-else description="暂无运行队列，创建运行后会出现在这里。" />

      <div v-if="page > 1 || hasNextPage" class="pagination-row">
        <ElButton :disabled="page <= 1" @click="handlePageChange(page - 1)">上一页</ElButton>
        <span>第 {{ page }} 页</span>
        <ElButton :disabled="!hasNextPage" @click="handlePageChange(page + 1)">下一页</ElButton>
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
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.queue-batch.selecting {
  grid-template-columns: 24px minmax(0, 1fr) 176px 112px 86px auto;
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
