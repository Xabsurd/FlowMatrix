<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()

interface Task {
  id: string
  batchRunId: string
  workflowId: string
  presetId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'retrying'
  backendId: string | null
  inputParams: Record<string, unknown>
  resultJson: Record<string, unknown> | null
  errorMessage: string | null
  retryCount: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

interface ResultFile {
  id: string
  taskId: string
  outputType: string
  fileName: string
  fileSize: number
  metadata: Record<string, unknown> | null
}

interface BatchDetail {
  id: string
  name: string | null
  presetId: string
  workflowId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
  combinationMode: 'cartesian' | 'zip' | 'table'
  totalTasks: number
  completedTasks: number
  failedTasks: number
  canceledTasks: number
  createdAt: number
  finishedAt: number | null
  tasks: Task[]
  results: ResultFile[]
  taskPage: {
    limit: number
    offset: number
    total: number
  }
  resultStats: {
    totalCount: number
    activeCount: number
    deletedCount: number
    totalSize: number
  }
}

const detail = ref<BatchDetail | null>(null)
const loading = ref(false)
const retrying = ref(false)
const polling = ref<NodeJS.Timeout | null>(null)
const expandedTaskIds = ref<string[]>([])
const taskPage = reactive({
  page: 1,
  limit: 50
})

const lightboxVisible = ref(false)
const activeResult = ref<ResultFile | null>(null)

async function fetchDetail(quiet = false) {
  if (!quiet) loading.value = true
  try {
    const params = new URLSearchParams({
      taskLimit: String(taskPage.limit),
      taskOffset: String((taskPage.page - 1) * taskPage.limit)
    })
    const data = await $fetch<BatchDetail>(`/api/v1/batch/${route.params.id}?${params}`)
    detail.value = data
    
    if (['completed', 'failed', 'canceled'].includes(data.status)) {
      stopPolling()
    } else {
      startPolling()
    }
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '获取详情失败')
  } finally {
    if (!quiet) loading.value = false
  }
}

function handleTaskPageChange(page: number) {
  taskPage.page = page
  expandedTaskIds.value = []
  void fetchDetail()
}

function startPolling() {
  if (polling.value) return
  polling.value = setInterval(() => {
    void fetchDetail(true)
  }, 2000)
}

function stopPolling() {
  if (polling.value) {
    clearInterval(polling.value)
    polling.value = null
  }
}

async function cancelBatch() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm('确定取消所有未完成任务？', '取消运行', { type: 'warning' })
    await $fetch(`/api/v1/batch/${detail.value.id}/cancel`, { method: 'POST' })
    ElMessage.success('取消指令已发送')
    await fetchDetail()
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '取消失败')
  }
}

async function retryFailed() {
  if (!detail.value) return
  retrying.value = true
  try {
    const result = await $fetch<{ count: number }>(`/api/v1/batch/${detail.value.id}/retry`, { method: 'POST' })
    if (result.count > 0) {
      ElMessage.success(`已重新推入 ${result.count} 个失败任务`)
      startPolling()
    } else {
      ElMessage.warning('没有可重试的失败任务')
    }
    await fetchDetail()
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '重试失败')
  } finally {
    retrying.value = false
  }
}

function getTaskResults(taskId: string) {
  return detail.value?.results.filter(r => r.taskId === taskId) || []
}

function visibleInputParams(inputParams: Record<string, unknown>) {
  return Object.entries(inputParams).filter(([key]) => !key.startsWith('_'))
}

function taskParamSummary(task: Task) {
  const params = visibleInputParams(task.inputParams)
  if (!params.length) return '无运行参数'
  return params
    .slice(0, 3)
    .map(([key, value]) => `${key.split('.').pop()}: ${typeof value === 'object' ? '文件/资源' : String(value)}`)
    .join(' · ')
}

function isTaskExpanded(taskId: string) {
  return expandedTaskIds.value.includes(taskId)
}

function toggleTask(taskId: string) {
  expandedTaskIds.value = isTaskExpanded(taskId)
    ? expandedTaskIds.value.filter(id => id !== taskId)
    : [...expandedTaskIds.value, taskId]
}

function getStatusType(status: string) {
  switch (status) {
    case 'succeeded':
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'primary'
    case 'queued': return 'warning'
    default: return 'info'
  }
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    succeeded: '成功',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消',
    retrying: '重试中'
  }
  return map[status] || status
}

function showLightbox(result: ResultFile) {
  activeResult.value = result
  lightboxVisible.value = true
}

function downloadResult(id: string) {
  globalThis.window?.open(`/api/v1/results/${id}/file?download`)
}

function backToRun() {
  void router.push(detail.value?.id ? `/gallery?batchRunId=${detail.value.id}` : '/gallery')
}

function formatDuration(row: unknown) {
  const task = row as Pick<Task, 'startedAt' | 'finishedAt'>
  if (!task.startedAt) return '-'
  const end = task.finishedAt || Date.now()
  const diff = (end - task.startedAt) / 1000
  if (diff < 60) return `${diff.toFixed(1)}s`
  const mins = Math.floor(diff / 60)
  const secs = Math.round(diff % 60)
  return `${mins}m ${secs}s`
}

function formatTime(val: number) {
  return new Date(val).toLocaleString('zh-CN')
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(() => {
  void fetchDetail()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div class="header-main">
        <button class="back-link" type="button" @click="backToRun">
          <FmIcon name="arrowLeft" :size="16" />
          返回结果
        </button>
        <div class="title-row">
          <h1 class="fm-page-title">
            {{ detail?.name || (detail ? `运行队列 #${detail.id.slice(0, 8)}` : '加载中...') }}
          </h1>
          <ElTag v-if="detail" :type="getStatusType(detail.status)" effect="dark">
            {{ getStatusLabel(detail.status) }}
          </ElTag>
        </div>
        <p class="fm-page-subtitle">
          批次 ID：{{ route.params.id }} · 创建于 {{ detail ? formatTime(detail.createdAt) : '-' }}
        </p>
      </div>
      <div v-if="detail" class="actions">
        <ElButton
          v-if="detail.status === 'running' || detail.status === 'queued'"
          type="danger"
          @click="cancelBatch"
        >
          取消未完成
        </ElButton>
        <ElButton
          v-if="detail.status === 'failed' || detail.failedTasks > 0"
          type="warning"
          :loading="retrying"
          @click="retryFailed"
        >
          重试失败任务
        </ElButton>
        <ElButton :loading="loading" @click="fetchDetail(false)">刷新</ElButton>
      </div>
    </div>

    <div v-if="detail" class="fm-grid two top-cards">
      <div class="fm-card progress-card">
        <h3>执行进度</h3>
        <div class="progress-bar-wrapper">
          <ElProgress
            type="circle"
            :percentage="detail.totalTasks > 0 ? Math.round(((detail.completedTasks + detail.failedTasks + detail.canceledTasks) / detail.totalTasks) * 100) : 0"
            :status="detail.status === 'failed' ? 'exception' : (detail.status === 'completed' ? 'success' : undefined)"
            :width="120"
          />
          <div class="progress-details">
            <div class="stat-item">
              <span class="dot queued" />
              <span>排队中</span>
              <strong>{{ detail.totalTasks - (detail.completedTasks + detail.failedTasks + detail.canceledTasks) }}</strong>
            </div>
            <div class="stat-item">
              <span class="dot succeeded" />
              <span>成功</span>
              <strong class="text-success">{{ detail.completedTasks }}</strong>
            </div>
            <div class="stat-item">
              <span class="dot failed" />
              <span>失败</span>
              <strong class="text-danger">{{ detail.failedTasks }}</strong>
            </div>
            <div class="stat-item">
              <span class="dot canceled" />
              <span>已取消</span>
              <strong>{{ detail.canceledTasks }}</strong>
            </div>
            <div class="stat-item">
              <span>总任务数</span>
              <strong>{{ detail.totalTasks }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="fm-card config-card">
        <h3>运行摘要</h3>
        <ElDescriptions :column="1" border class="fm-descriptions">
          <ElDescriptionsItem label="组合模式">
            {{ detail.combinationMode === 'cartesian' ? '笛卡尔积（全参数组合）' : detail.combinationMode === 'zip' ? '逐行对应（配对模式）' : '表格模式' }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="生成文件数">
            {{ detail.resultStats.activeCount }} 个输出文件 (共 {{ formatSize(detail.resultStats.totalSize) }})
          </ElDescriptionsItem>
          <ElDescriptionsItem label="工作流 ID">
            <span class="mono">{{ detail.workflowId }}</span>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="调用配置 ID">
            <span class="mono">{{ detail.presetId }}</span>
          </ElDescriptionsItem>
        </ElDescriptions>
      </div>
    </div>

    <div v-if="detail" class="tasks-container fm-panel">
      <div class="panel-header">
        <h3>队列任务</h3>
        <span>第 {{ detail.taskPage.offset + 1 }} - {{ Math.min(detail.taskPage.offset + detail.tasks.length, detail.taskPage.total) }} 个，共 {{ detail.taskPage.total }} 个任务</span>
      </div>
      <div class="queue-task-list">
        <article
          v-for="(task, index) in detail.tasks"
          :key="task.id"
          class="queue-task"
          :class="{ expanded: isTaskExpanded(task.id) }"
        >
          <button class="queue-task-summary" type="button" @click="toggleTask(task.id)">
            <span class="queue-index mono">#{{ index + 1 }}</span>
            <span class="queue-param" :title="taskParamSummary(task)">
              {{ taskParamSummary(task) }}
            </span>
            <ElTag :type="getStatusType(task.status)" size="small" effect="light">
              {{ getStatusLabel(task.status) }}
            </ElTag>
            <span class="queue-meta">
              <span v-if="task.backendId" class="mono">{{ task.backendId.slice(0, 8) }}</span>
              <span v-else>-</span>
              <span>{{ formatDuration(task) }}</span>
              <span>{{ getTaskResults(task.id).length }} 个结果</span>
            </span>
            <FmIcon :name="isTaskExpanded(task.id) ? 'chevronUp' : 'chevronDown'" />
          </button>

           <div v-if="isTaskExpanded(task.id)" class="queue-task-detail">
            <section>
              <div class="detail-section-head">
                <h4>运行参数</h4>
              </div>
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
                <div
                  v-for="res in getTaskResults(task.id)"
                  :key="res.id"
                  class="thumbnail-wrapper"
                  @click="showLightbox(res)"
                >
                  <img :src="`/api/v1/results/${res.id}/file`" class="thumbnail-img" >
                </div>
              </div>
              <div v-else-if="task.status === 'failed'" class="error-wrapper">
                <span class="error-msg" :title="task.errorMessage || ''">
                  {{ task.errorMessage || '未知执行错误' }}
                </span>
              </div>
              <span v-else class="text-muted">暂无输出</span>
            </section>
          </div>
        </article>
      </div>
      <div v-if="detail.taskPage.total > taskPage.limit" class="task-pagination">
        <ElPagination
          v-model:current-page="taskPage.page"
          background
          layout="prev, pager, next"
          :total="detail.taskPage.total"
          :page-size="taskPage.limit"
          @current-change="handleTaskPageChange"
        />
      </div>
    </div>

    <ElDialog
      v-model="lightboxVisible"
      title="生成结果详情"
      width="820px"
      append-to-body
      class="lightbox-dialog"
    >
      <div v-if="activeResult" class="lightbox-layout">
        <div class="image-viewer">
          <img :src="`/api/v1/results/${activeResult.id}/file`" class="lightbox-img" >
        </div>
        <div class="metadata-panel">
          <h3>文件信息</h3>
          <div class="meta-item">
            <span>文件名:</span>
            <strong>{{ activeResult.fileName }}</strong>
          </div>
          <div class="meta-item">
            <span>文件大小:</span>
            <strong>{{ formatSize(activeResult.fileSize) }}</strong>
          </div>
          <div class="meta-item">
            <span>文件 ID:</span>
            <span class="mono">{{ activeResult.id }}</span>
          </div>

          <template v-if="activeResult.metadata">
            <h3>生成元数据</h3>
            <div v-for="(v, k) in activeResult.metadata" :key="k" class="meta-item">
              <span>{{ k }}:</span>
              <strong v-if="typeof v !== 'object'">{{ v }}</strong>
              <pre v-else class="code-pre">{{ JSON.stringify(v, null, 2) }}</pre>
            </div>
          </template>

          <div class="lightbox-actions">
            <ElButton
              type="primary"
              @click="downloadResult(activeResult.id)"
            >
              下载文件
            </ElButton>
          </div>
        </div>
      </div>
    </ElDialog>
  </section>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  width: auto;
  margin: 0 0 10px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--fm-muted);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: color 160ms ease, transform 160ms ease;
}

.back-link:hover {
  color: var(--fm-text);
  transform: translateX(-2px);
}

.back-link:focus-visible {
  border-radius: 6px;
  outline: 2px solid color-mix(in srgb, var(--fm-primary) 42%, transparent);
  outline-offset: 3px;
}

.header-main {
  display: flex;
  flex-direction: column;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-cards {
  margin-bottom: 8px;
}

.progress-card {
  padding: 20px;
}

.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 36px;
  margin-top: 14px;
}

.progress-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 24px;
  flex: 1;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fm-muted);
}

.stat-item strong {
  margin-left: auto;
  color: var(--fm-text);
  font-size: 15px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.queued { background: var(--fm-warning); }
.dot.succeeded { background: var(--fm-success); }
.dot.failed { background: var(--fm-danger); }
.dot.canceled { background: var(--fm-muted); }

.mono {
  font-family: monospace;
  font-size: 12px;
}

.tasks-container {
  padding: 16px;
  background: var(--fm-panel);
  border-radius: var(--fm-radius);
  box-shadow: var(--fm-shadow);
}

.panel-header h3 {
  margin: 0;
  color: var(--fm-text);
  font-size: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-header span {
  color: var(--fm-muted);
  font-size: 12px;
}

.queue-task-list {
  display: grid;
  gap: 8px;
}

.task-pagination {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}

.queue-task {
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 68%, transparent);
  overflow: hidden;
  transition: border-color 160ms ease, background 160ms ease;
}

.queue-task.expanded {
  border-color: color-mix(in srgb, var(--fm-primary) 32%, var(--fm-border));
  background: color-mix(in srgb, var(--fm-primary) 7%, var(--fm-panel-muted));
}

.queue-task-summary {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto minmax(260px, auto) 24px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: var(--fm-text);
  text-align: left;
  cursor: pointer;
}

.queue-task-summary:hover {
  background: color-mix(in srgb, var(--fm-primary) 8%, transparent);
}

.queue-index {
  color: var(--fm-muted);
}

.queue-param {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-meta {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  color: var(--fm-muted);
  font-size: 12px;
  white-space: nowrap;
}

.queue-task-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr);
  gap: 16px;
  padding: 0 14px 14px 98px;
}

.queue-task-detail section {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.queue-task-detail h4 {
  margin: 0;
  color: var(--fm-muted);
  font-size: 12px;
  font-weight: 600;
}

.detail-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
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
  background: color-mix(in srgb, var(--fm-primary) 12%, transparent);
  padding: 2px 6px;
  color: var(--fm-primary);
  font-weight: bold;
}

.p-val {
  background: color-mix(in srgb, var(--fm-panel-strong) 80%, transparent);
  padding: 2px 6px;
  color: var(--fm-text);
}

.outputs-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.thumbnail-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
  border: 1px solid var(--fm-border);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--fm-panel-muted);
  transition: transform 150ms ease, border-color 150ms ease;
}

.thumbnail-wrapper:hover {
  transform: scale(1.08);
  border-color: var(--fm-primary);
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.error-wrapper {
  max-width: 320px;
}

.error-msg {
  display: block;
  font-size: 12px;
  color: var(--fm-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lightbox-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 20px;
  min-height: 460px;
}

.image-viewer {
  display: grid;
  place-items: center;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.lightbox-img {
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
}

.metadata-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  overflow-y: auto;
  max-height: 480px;
}

.metadata-panel h3 {
  margin: 12px 0 6px;
  font-size: 14px;
  color: var(--fm-primary);
  border-left: 3px solid var(--fm-primary);
  padding-left: 8px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 13px;
  color: var(--fm-muted);
}

.meta-item strong {
  color: var(--fm-text);
  word-break: break-all;
  text-align: right;
}

.code-pre {
  background: var(--fm-panel-muted);
  border: 1px solid var(--fm-border);
  padding: 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  overflow-x: auto;
  width: 100%;
  margin: 4px 0 0;
  text-align: left;
}

.lightbox-actions {
  margin-top: auto;
  padding-top: 16px;
}

@media (max-width: 760px) {
  .lightbox-layout {
    grid-template-columns: 1fr;
  }

  .panel-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .queue-task-summary {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .queue-task-summary .el-tag,
  .queue-meta {
    grid-column: 2 / -1;
  }

  .queue-meta {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .queue-task-summary svg {
    grid-column: 3;
    grid-row: 1;
  }

  .queue-task-detail {
    grid-template-columns: 1fr;
    padding-left: 14px;
  }
}
</style>
