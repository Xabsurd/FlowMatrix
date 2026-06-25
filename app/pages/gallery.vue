<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

interface ResultFile {
  id: string
  taskId: string
  batchRunId: string
  workspaceId: string
  outputType: string
  storageDriver: string
  storageKey: string
  fileName: string
  mimeType: string
  fileSize: number
  fileHash: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
}

interface ResultsResponse {
  results: ResultFile[]
  total: number
  limit: number
  offset: number
}

const results = ref<ResultFile[]>([])
const total = ref(0)
const loading = ref(false)

// Query filters
const filters = reactive({
  batchRunId: '',
  outputType: 'image',
  page: 1,
  limit: 24
})

// Multi-select state
const selectMode = ref(false)
const selectedIds = ref<string[]>([])

// Lightbox state
const lightboxVisible = ref(false)
const activeResult = ref<ResultFile | null>(null)

async function fetchResults() {
  loading.value = true
  try {
    const offset = (filters.page - 1) * filters.limit
    const params = new URLSearchParams({
      limit: String(filters.limit),
      offset: String(offset),
      outputType: filters.outputType
    })
    if (filters.batchRunId) params.append('batchRunId', filters.batchRunId.trim())
    
    const data = await $fetch<ResultsResponse>(`/api/v1/results?${params}`)
    results.value = data.results
    total.value = data.total
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '获取结果图库失败')
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) {
  filters.page = page
  void fetchResults()
}

function handleFilterChange() {
  filters.page = 1
  selectedIds.value = []
  void fetchResults()
}

function toggleSelect(id: string) {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) {
    selectedIds.value.splice(index, 1)
  } else {
    selectedIds.value.push(id)
  }
}

function isSelected(id: string) {
  return selectedIds.value.includes(id)
}

function cancelSelection() {
  selectedIds.value = []
  selectMode.value = false
}

async function deleteSingle(result: ResultFile) {
  try {
    await ElMessageBox.confirm(`确定删除结果文件「${result.fileName}」？数据库记录会被标记为已删除。`, '删除确认', {
      type: 'warning'
    })
    await $fetch(`/api/v1/results/${result.id}`, { method: 'DELETE' })
    ElMessage.success('已删除')
    // Refresh
    await fetchResults()
    if (activeResult.value?.id === result.id) {
      lightboxVisible.value = false
    }
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

async function deleteBulk() {
  if (selectedIds.value.length === 0) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 个结果？`, '批量删除', {
      type: 'warning'
    })
    const result = await $fetch<{ deletedCount: number }>('/api/v1/results/batch-delete', {
      method: 'POST',
      body: { ids: selectedIds.value }
    })
    ElMessage.success(`成功删除 ${result.deletedCount} 个结果`)
    selectedIds.value = []
    selectMode.value = false
    await fetchResults()
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '批量删除失败')
  }
}

function showLightbox(result: ResultFile) {
  if (selectMode.value) {
    toggleSelect(result.id)
    return
  }
  activeResult.value = result
  lightboxVisible.value = true
}

function downloadResult(id: string) {
  globalThis.window?.open(`/api/v1/results/${id}/file?download`)
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(val: number) {
  return new Date(val).toLocaleString('zh-CN')
}

onMounted(() => {
  void fetchResults()
})
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">结果图库</h1>
        <p class="fm-page-subtitle">服务端统一归档结果，支持多选删除、下载和元数据查看。</p>
      </div>
      <div class="actions">
        <ElButton
          v-if="!selectMode"
          :disabled="results.length === 0"
          @click="selectMode = true"
        >
          批量管理
        </ElButton>
        <template v-else>
          <ElButton type="danger" :disabled="selectedIds.length === 0" @click="deleteBulk">
            删除选中 ({{ selectedIds.length }})
          </ElButton>
          <ElButton @click="cancelSelection">取消选择</ElButton>
        </template>
        <ElButton type="primary" :loading="loading" @click="fetchResults">刷新</ElButton>
      </div>
    </div>

    <!-- Filters -->
    <div class="gallery-filters fm-panel">
      <ElForm :inline="true" :model="filters" @submit.prevent>
        <ElFormItem label="批次过滤">
          <ElInput
            v-model="filters.batchRunId"
            placeholder="输入批次 ID"
            clearable
            style="width: 280px"
            @change="handleFilterChange"
          />
        </ElFormItem>
        <ElFormItem label="类型">
          <ElSelect
            v-model="filters.outputType"
            style="width: 120px"
            @change="handleFilterChange"
          >
            <ElOption label="图片" value="image" />
            <ElOption label="视频" value="video" />
            <ElOption label="文本" value="text" />
            <ElOption label="其他" value="other" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
    </div>

    <!-- Grid -->
    <div v-loading="loading" class="gallery-container">
      <div v-if="results.length" class="gallery-grid">
        <article
          v-for="item in results"
          :key="item.id"
          class="gallery-card fm-card"
          :class="{ selected: isSelected(item.id), 'select-mode-active': selectMode }"
          @click="showLightbox(item)"
        >
          <div class="card-media">
            <img :src="`/api/v1/results/${item.id}/file`" class="card-img" loading="lazy" >
            <div v-if="selectMode || isSelected(item.id)" class="select-overlay">
              <div class="select-indicator">
                <span v-if="isSelected(item.id)" class="check-icon">✓</span>
              </div>
            </div>
          </div>
          <div class="card-info">
            <span class="filename" :title="item.fileName">{{ item.fileName }}</span>
            <span class="meta-row">
              <span>{{ formatSize(item.fileSize) }}</span>
              <span>{{ formatTime(item.createdAt).split(' ')[0] }}</span>
            </span>
          </div>
        </article>
      </div>

      <ElEmpty v-else description="图库中暂无结果" />

      <!-- Pagination -->
      <div v-if="total > filters.limit" class="pagination-row">
        <ElPagination
          v-model:current-page="filters.page"
          background
          layout="prev, pager, next"
          :total="total"
          :page-size="filters.limit"
          class="fm-pagination"
          @current-change="handlePageChange"
        />
      </div>
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
          <div class="meta-item">
            <span>批次 ID:</span>
            <span class="mono">{{ activeResult.batchRunId }}</span>
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
            <ElButton type="danger" @click="deleteSingle(activeResult)">删除结果</ElButton>
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
.gallery-filters {
  padding: 14px 16px 2px;
  background: var(--fm-panel);
  border-radius: var(--fm-radius);
  box-shadow: var(--fm-shadow);
  margin-bottom: 8px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.gallery-card {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  position: relative;
  background: var(--fm-panel) !important;
}

.gallery-card:hover {
  transform: translateY(-4px);
  border-color: var(--fm-primary) !important;
  box-shadow: 0 12px 30px var(--fm-shadow);
}

.gallery-card.selected {
  border-color: var(--fm-primary) !important;
  box-shadow: 0 0 0 2px var(--fm-primary);
}

.card-media {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--fm-panel-muted);
  overflow: hidden;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 300ms ease;
}

.gallery-card:hover .card-img {
  transform: scale(1.05);
}

.select-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 8px;
}

.select-indicator {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid white;
  background: rgba(255, 255, 255, 0.15);
  display: grid;
  place-items: center;
}

.gallery-card.selected .select-indicator {
  background: var(--fm-primary);
  border-color: var(--fm-primary);
}

.check-icon {
  color: white;
  font-size: 12px;
  font-weight: bold;
}

.card-info {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filename {
  font-size: 13px;
  color: var(--fm-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--fm-muted);
}

.pagination-row {
  display: flex;
  justify-content: center;
  margin-top: 24px;
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
  display: flex;
  gap: 10px;
  padding-top: 16px;
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

@media (max-width: 760px) {
  .lightbox-layout {
    grid-template-columns: 1fr;
  }
}
</style>
