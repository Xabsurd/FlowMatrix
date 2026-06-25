<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { BatchDetail, ResultFile, Task } from '~/types/gallery'
import {
  batchProgress,
  batchSubtitle,
  batchTitle,
  canceledCount,
  COPIED_TASK_STORAGE_KEY,
  failedCount,
  formatDuration,
  formatSize,
  isImageResult,
  modeLabel,
  queuedCount,
  resultUrl,
  runningCount,
  succeededCount,
  statusLabel,
  statusType,
  taskParamSummary,
  visibleInputParams
} from '~/utils/gallery'

const route = useRoute()
const { rowActionSize } = useUiPreferences()

const batchId = computed(() => String(route.params.id || ''))
const detail = ref<BatchDetail | null>(null)
const loading = ref(false)
const page = ref(1)
const limit = 50
const expandedTaskIds = ref<string[]>([])
const activeResult = ref<ResultFile | null>(null)
const lightboxVisible = ref(false)

const imageResults = computed(() => detail.value?.results.filter(isImageResult) ?? [])
const viewerUrls = computed(() => imageResults.value.map(resultUrl))
const activeResultIndex = computed(() => activeResult.value
  ? Math.max(0, imageResults.value.findIndex(result => result.id === activeResult.value?.id))
  : 0)

async function fetchDetail() {
  if (!batchId.value) return
  loading.value = true
  try {
    const params = new URLSearchParams({
      taskLimit: String(limit),
      taskOffset: String((page.value - 1) * limit)
    })
    detail.value = await $fetch<BatchDetail>(`/api/v1/batch/${batchId.value}?${params}`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '获取详情失败')
  } finally {
    loading.value = false
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

function getTaskResults(taskId: string) {
  return detail.value?.results.filter(result => result.taskId === taskId) || []
}

function isTaskExpanded(taskId: string) {
  return expandedTaskIds.value.includes(taskId)
}

function toggleTask(taskId: string) {
  expandedTaskIds.value = isTaskExpanded(taskId)
    ? expandedTaskIds.value.filter(id => id !== taskId)
    : [...expandedTaskIds.value, taskId]
}

function handlePageChange(nextPage: number) {
  page.value = nextPage
  expandedTaskIds.value = []
  void fetchDetail()
}

function showLightbox(result: ResultFile) {
  if (!isImageResult(result)) return
  activeResult.value = result
  lightboxVisible.value = true
}

function handleViewerSwitch(index: number) {
  activeResult.value = imageResults.value[index] || null
}

function closeLightbox() {
  lightboxVisible.value = false
  activeResult.value = null
}

function backToQueue() {
  void navigateTo('/gallery')
}

function openResults() {
  void navigateTo(`/gallery/${batchId.value}/results`)
}

onMounted(fetchDetail)
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">运行详情</h1>
        <p class="fm-page-subtitle">当前批次的执行进度、任务参数和运行摘要。</p>
      </div>
      <div class="actions">
        <ElButton @click="backToQueue">
          <FmIcon name="arrowLeft" :size="16" />
          返回列表
        </ElButton>
        <ElButton @click="openResults">结果</ElButton>
        <ElButton :loading="loading" type="primary" @click="fetchDetail">刷新详情</ElButton>
      </div>
    </div>

    <section v-loading="loading" class="fm-stack">
      <ElEmpty v-if="!detail" description="正在读取运行详情。" />

      <template v-else>
        <div class="detail-header fm-card">
          <div>
            <h2>{{ batchTitle(detail) }}</h2>
            <span>{{ batchSubtitle(detail) }}</span>
          </div>
          <ElTag :type="statusType(detail.status)" effect="light">{{ statusLabel(detail.status) }}</ElTag>
        </div>

        <div class="detail-grid">
          <div class="fm-card progress-card">
            <h3>执行进度</h3>
            <div class="progress-layout">
              <ElProgress
                type="circle"
                :percentage="batchProgress(detail)"
                :status="detail.status === 'failed' ? 'exception' : detail.status === 'completed' ? 'success' : undefined"
                :width="112" />
              <div class="progress-details">
                <div class="stat-item"><span class="dot queued" /><span>排队中</span><strong>{{ queuedCount(detail) }}</strong></div>
                <div class="stat-item"><span class="dot running" /><span>运行中</span><strong>{{ runningCount(detail) }}</strong></div>
                <div class="stat-item"><span class="dot succeeded" /><span>成功</span><strong>{{ succeededCount(detail) }}</strong></div>
                <div class="stat-item"><span class="dot failed" /><span>失败</span><strong>{{ failedCount(detail) }}</strong></div>
                <div class="stat-item"><span class="dot canceled" /><span>已取消</span><strong>{{ canceledCount(detail) }}</strong></div>
              </div>
            </div>
          </div>

          <div class="fm-card summary-card">
            <h3>运行摘要</h3>
            <div class="summary-list">
              <div><span>组合模式</span><strong>{{ modeLabel(detail.combinationMode) }}</strong></div>
              <div><span>生成文件</span><strong>{{ detail.resultStats.activeCount }} 个 / {{ formatSize(detail.resultStats.totalSize) }}</strong></div>
              <div><span>工作流</span><strong class="mono">{{ detail.workflowId }}</strong></div>
              <div><span>调用配置</span><strong class="mono">{{ detail.presetId }}</strong></div>
            </div>
          </div>
        </div>

        <div class="tasks-panel fm-card">
          <div class="fm-section-head">
            <div>
              <h2>队列任务</h2>
              <span>第 {{ detail.taskPage.offset + 1 }} - {{ Math.min(detail.taskPage.offset + detail.tasks.length, detail.taskPage.total) }} 个，共 {{ detail.taskPage.total }} 个任务</span>
            </div>
          </div>

          <div class="fm-stack-sm">
            <article v-for="(task, index) in detail.tasks" :key="task.id" class="task-row" :class="{ expanded: isTaskExpanded(task.id) }">
              <button class="task-summary" type="button" @click="toggleTask(task.id)">
                <span class="task-index mono">#{{ detail.taskPage.offset + index + 1 }}</span>
                <span class="task-param" :title="taskParamSummary(task)">{{ taskParamSummary(task) }}</span>
                <ElTag :type="statusType(task.status)" size="small" effect="light">{{ statusLabel(task.status) }}</ElTag>
                <span class="task-meta">
                  <span>{{ task.backendId ? task.backendId.slice(0, 8) : '-' }}</span>
                  <span>{{ formatDuration(task) }}</span>
                  <span>{{ getTaskResults(task.id).length }} 个结果</span>
                </span>
                <ElButton :size="rowActionSize" @click.stop="copyTaskToRun(task)">复制</ElButton>
                <FmIcon :name="isTaskExpanded(task.id) ? 'chevronUp' : 'chevronDown'" />
              </button>

              <div v-if="isTaskExpanded(task.id)" class="task-detail">
                <section>
                  <h4>运行参数</h4>
                  <div class="params-column">
                    <div v-for="[k, v] in visibleInputParams(task.inputParams)" :key="k" class="param-badge">
                      <span class="p-key">{{ k.split('.').pop() }}</span>
                      <span class="p-val" :title="String(v)">{{ typeof v === 'object' ? '文件/资源' : String(v) }}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h4>结果 / 错误</h4>
                  <div v-if="task.status === 'succeeded' && getTaskResults(task.id).length" class="outputs-list">
                    <button v-for="res in getTaskResults(task.id)" :key="res.id" class="thumbnail-wrapper" type="button" @click="showLightbox(res)">
                      <img v-if="isImageResult(res)" :src="resultUrl(res)" class="thumbnail-img" >
                      <span v-else>{{ res.outputType }}</span>
                    </button>
                  </div>
                  <div v-else-if="task.status === 'failed'" class="error-wrapper">
                    <span class="error-msg" :title="task.errorMessage || ''">{{ task.errorMessage || '未知执行错误' }}</span>
                  </div>
                  <span v-else class="text-muted">暂无输出</span>
                </section>
              </div>
            </article>
          </div>

          <div v-if="detail.taskPage.total > limit" class="pagination-row">
            <ElPagination
              v-model:current-page="page"
              background
              layout="prev, pager, next"
              :total="detail.taskPage.total"
              :page-size="limit"
              @current-change="handlePageChange" />
          </div>
        </div>
      </template>
    </section>

    <ClientOnly>
      <ElImageViewer
        v-if="lightboxVisible"
        :url-list="viewerUrls"
        :initial-index="activeResultIndex"
        :infinite="false"
        :hide-on-click-modal="true"
        :teleported="true"
        @close="closeLightbox"
        @switch="handleViewerSwitch" />
    </ClientOnly>
  </section>
</template>

<style scoped lang="scss">
.progress-card,
.summary-card,
.tasks-panel {
  display: grid;
  gap: 14px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-header h2,
.fm-section-head h2 {
  margin: 0 0 4px;
  color: var(--fm-text);
  font-size: 18px;
}

.detail-header span,
.fm-section-head span,
.summary-list span,
.task-meta {
  color: var(--fm-muted);
  font-size: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  gap: 14px;
}

.progress-card h3,
.summary-card h3 {
  margin: 0;
  color: var(--fm-text);
  font-size: 16px;
}

.progress-layout {
  display: flex;
  align-items: center;
  gap: 28px;
}

.progress-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  flex: 1;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--fm-muted);
  font-size: 13px;
}

.stat-item strong {
  margin-left: auto;
  color: var(--fm-text);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.queued { background: var(--fm-warning); }
.dot.running { background: var(--fm-primary); }
.dot.succeeded { background: var(--fm-success); }
.dot.failed { background: var(--fm-danger); }
.dot.canceled { background: var(--fm-muted); }

.summary-list {
  display: grid;
  gap: 8px;
}

.summary-list div {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--fm-border);
}

.summary-list div:last-child {
  border-bottom: 0;
}

.summary-list strong {
  overflow: hidden;
  color: var(--fm-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-row {
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 68%, transparent);
  overflow: hidden;
}

.task-row.expanded {
  border-color: color-mix(in srgb, var(--fm-primary) 32%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 7%, var(--fm-panel-muted));
}

.task-summary {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto minmax(220px, auto) auto 22px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: var(--fm-text);
  text-align: left;
  cursor: pointer;
}

.task-summary:hover {
  background: color-mix(in srgb, var(--fm-primary) 8%, transparent);
}

.task-index {
  color: var(--fm-muted);
}

.task-param {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}

.task-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(240px, 0.9fr);
  gap: 16px;
  padding: 0 12px 12px 80px;
}

.task-detail section {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.task-detail h4 {
  margin: 0;
  color: var(--fm-muted);
  font-size: 12px;
  font-weight: 600;
}

.params-column {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 80px;
  overflow-y: auto;
}

.param-badge {
  display: inline-flex;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  overflow: hidden;
  font-size: 11px;
}

.p-key {
  padding: 2px 6px;
  background: color-mix(in srgb, var(--fm-primary) 12%, transparent);
  color: var(--fm-primary);
  font-weight: 700;
}

.p-val {
  padding: 2px 6px;
  background: color-mix(in srgb, var(--fm-panel-strong) 80%, transparent);
  color: var(--fm-text);
}

.outputs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.thumbnail-wrapper {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 1px solid var(--fm-border);
  border-radius: 6px;
  background: var(--fm-panel-muted);
  color: var(--fm-muted);
  overflow: hidden;
  cursor: pointer;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.error-msg {
  display: block;
  overflow: hidden;
  color: var(--fm-danger);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pagination-row {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .detail-grid,
  .task-detail {
    grid-template-columns: 1fr;
  }

  .task-summary {
    grid-template-columns: 1fr;
    justify-items: stretch;
  }

  .task-meta,
  .fm-section-head {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .task-detail {
    padding-left: 12px;
  }
}

@media (max-width: 760px) {
  .detail-header,
  .progress-layout {
    align-items: flex-start;
    flex-direction: column;
  }

  .progress-details,
  .summary-list div {
    grid-template-columns: 1fr;
  }
}
</style>
