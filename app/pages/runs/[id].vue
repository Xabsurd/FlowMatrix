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
  resultStats: {
    totalCount: number
    activeCount: number
    deletedCount: number
    totalSize: number
  }
}

const detail = ref<BatchDetail | null>(null)
const loading = ref(false)
const polling = ref<NodeJS.Timeout | null>(null)

// Lightbox modal state
const lightboxVisible = ref(false)
const activeResult = ref<ResultFile | null>(null)

async function fetchDetail(quiet = false) {
  if (!quiet) loading.value = true
  try {
    const data = await $fetch<BatchDetail>(`/api/v1/batch/${route.params.id}`)
    detail.value = data
    
    // Stop polling if the batch is in a terminal state
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
  try {
    const result = await $fetch<{ count: number }>(`/api/v1/batch/${detail.value.id}/retry`, { method: 'POST' })
    ElMessage.success(`已重新推入 ${result.count} 个失败任务`)
    await fetchDetail()
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '重试失败')
  }
}

function getTaskResults(taskId: string) {
  return detail.value?.results.filter(r => r.taskId === taskId) || []
}

function visibleInputParams(inputParams: Record<string, unknown>) {
  return Object.entries(inputParams).filter(([key]) => !key.startsWith('_'))
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
        <ElButton size="small" class="back-btn" @click="router.push('/runs')">
          返回运行
        </ElButton>
        <div class="title-row">
          <h1 class="fm-page-title">
            {{ detail?.name || (detail ? `批次运行 #${detail.id.slice(0, 8)}` : '加载中...') }}
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
          @click="retryFailed"
        >
          重试失败任务
        </ElButton>
        <ElButton :loading="loading" @click="fetchDetail(false)">刷新</ElButton>
      </div>
    </div>

    <div v-if="detail" class="fm-grid two top-cards">
      <!-- Progress Card -->
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

      <!-- Settings summary -->
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

    <!-- Tasks table -->
    <div v-if="detail" class="tasks-container fm-panel">
      <div class="panel-header">
        <h3>任务列表</h3>
      </div>
      <ElTable :data="detail.tasks" style="width: 100%" class="fm-table-view">
        <ElTableColumn label="索引" width="70">
          <template #default="{ $index }">
            <span class="mono">#{{ $index + 1 }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="参数" min-width="260">
          <template #default="{ row }">
            <div class="params-column">
              <div v-for="[k, v] in visibleInputParams(row.inputParams)" :key="k" class="param-badge">
                <span class="p-key">{{ k.split('.').pop() }}</span>
                <span class="p-val" :title="String(v)">{{ typeof v === 'object' ? '文件/资源' : String(v) }}</span>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="getStatusType(row.status)" size="small" effect="light">
              {{ getStatusLabel(row.status) }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="执行后端" width="140">
          <template #default="{ row }">
            <span v-if="row.backendId" class="mono">{{ row.backendId.slice(0, 8) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="耗时" width="90">
          <template #default="{ row }">
            <span>{{ formatDuration(row) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="结果 / 错误" min-width="240">
          <template #default="{ row }">
            <div v-if="row.status === 'succeeded'" class="outputs-list">
              <div
                v-for="res in getTaskResults(row.id)"
                :key="res.id"
                class="thumbnail-wrapper"
                @click="showLightbox(res)"
              >
                <img :src="`/api/v1/results/${res.id}/file`" class="thumbnail-img" >
              </div>
            </div>
            <div v-else-if="row.status === 'failed'" class="error-wrapper">
              <span class="error-msg" :title="row.errorMessage || ''">
                {{ row.errorMessage || '未知执行错误' }}
              </span>
            </div>
            <span v-else class="text-muted">-</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <!-- Lightbox dialog -->
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
.back-btn {
  margin-bottom: 12px;
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
  margin: 0 0 16px;
  color: var(--fm-text);
  font-size: 16px;
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

/* Lightbox styles */
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
}
</style>
