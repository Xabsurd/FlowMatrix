<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { BatchDetail, BatchRun, ResultFile, ResultsResponse } from '~/types/gallery'
import { batchSubtitle, batchTitle, formatSize, resultUrl, isImageResult } from '~/utils/gallery'

const route = useRoute()

const batchId = computed(() => String(route.params.id || ''))
const loading = ref(false)
const batch = ref<BatchRun | null>(null)
const results = ref<ResultFile[]>([])
const total = ref(0)
const page = ref(1)
const limit = 48
const activeResult = ref<ResultFile | null>(null)
const lightboxVisible = ref(false)
const resultInfoVisible = ref(false)

const imageResults = computed(() => results.value.filter(isImageResult))
const viewerUrls = computed(() => imageResults.value.map(resultUrl))
const activeResultIndex = computed(() => activeResult.value
  ? Math.max(0, imageResults.value.findIndex(result => result.id === activeResult.value?.id))
  : 0)

async function fetchBatchMeta() {
  const detail = await $fetch<BatchDetail>(`/api/v1/batch/${batchId.value}?taskLimit=1&taskOffset=0`)
  batch.value = detail
}

async function fetchResults() {
  if (!batchId.value) return
  loading.value = true
  try {
    await fetchBatchMeta()
    const params = new URLSearchParams({
      batchRunId: batchId.value,
      limit: String(limit),
      offset: String((page.value - 1) * limit),
      includeTaskParams: 'true'
    })
    const response = await $fetch<ResultsResponse>(`/api/v1/results?${params}`)
    results.value = response.results
    total.value = response.total
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '获取结果失败')
  } finally {
    loading.value = false
  }
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
  resultInfoVisible.value = false
  activeResult.value = null
}

function showResultInfo() {
  if (!activeResult.value) return
  resultInfoVisible.value = true
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

function handlePageChange(nextPage: number) {
  page.value = nextPage
  void fetchResults()
}

onMounted(fetchResults)
</script>

<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">运行结果</h1>
        <p class="fm-page-subtitle">当前批次生成的图片、视频、音频和文件。</p>
      </div>
      <div class="actions">
        <ElButton @click="backToQueue">
          <FmIcon name="arrowLeft" :size="16" />
          返回列表
        </ElButton>
        <ElButton @click="openDetail">详情</ElButton>
        <ElButton :loading="loading" type="primary" @click="fetchResults">刷新结果</ElButton>
      </div>
    </div>

    <div class="detail-header fm-card">
      <div>
        <h2>{{ batch ? batchTitle(batch) : '运行结果' }}</h2>
        <span>{{ batch ? batchSubtitle(batch) : batchId }}</span>
      </div>
    </div>

    <section v-loading="loading">
      <GalleryResultMatrix :results="results" @preview="showLightbox" @download="downloadResult" />

      <div v-if="total > limit" class="pagination-row">
        <ElPagination
          v-model:current-page="page"
          background
          layout="prev, pager, next"
          :total="total"
          :page-size="limit"
          @current-change="handlePageChange" />
      </div>
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
      <div v-if="lightboxVisible && activeResult" class="fm-viewer-toolbar">
        <ElTooltip content="文件信息" placement="top">
          <button class="fm-viewer-tool" type="button" @click="showResultInfo">
            <FmIcon name="info" :size="18" />
          </button>
        </ElTooltip>
        <ElTooltip content="下载文件" placement="top">
          <button class="fm-viewer-tool" type="button" @click="downloadResult(activeResult.id)">
            下载
          </button>
        </ElTooltip>
      </div>

      <ElDialog
        v-model="resultInfoVisible"
        title="文件信息"
        width="520px"
        append-to-body
        class="fm-viewer-info-dialog"
      >
        <div v-if="activeResult" class="viewer-info-content">
          <div class="meta-item">
            <span>文件名</span>
            <strong>{{ activeResult.fileName }}</strong>
          </div>
          <div class="meta-item">
            <span>文件大小</span>
            <strong>{{ formatSize(activeResult.fileSize) }}</strong>
          </div>
          <div class="meta-item">
            <span>文件 ID</span>
            <span class="mono">{{ activeResult.id }}</span>
          </div>
          <template v-if="activeResult.metadata">
            <h3>生成元数据</h3>
            <div v-for="(v, k) in activeResult.metadata" :key="k" class="meta-item">
              <span>{{ k }}</span>
              <strong v-if="typeof v !== 'object'">{{ v }}</strong>
              <pre v-else class="code-pre">{{ JSON.stringify(v, null, 2) }}</pre>
            </div>
          </template>
        </div>
        <template #footer>
          <ElButton @click="resultInfoVisible = false">关闭</ElButton>
          <ElButton v-if="activeResult" type="primary" @click="downloadResult(activeResult.id)">下载</ElButton>
        </template>
      </ElDialog>
    </ClientOnly>
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

.pagination-row {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.fm-viewer-toolbar {
  display: inline-flex;
  position: fixed;
  bottom: 28px;
  left: 50%;
  z-index: 3001;
  gap: 8px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--fm-border) 76%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--fm-panel) 78%, transparent);
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.32);
  transform: translateX(-50%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.fm-viewer-tool {
  display: inline-grid;
  place-items: center;
  min-width: 38px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fm-panel-muted) 82%, transparent);
  color: var(--fm-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.fm-viewer-tool:hover {
  border-color: color-mix(in srgb, var(--fm-primary) 42%, transparent);
  color: var(--fm-primary);
}

.viewer-info-content {
  display: grid;
  gap: 10px;
  max-height: min(62vh, 560px);
  overflow: auto;
}

.viewer-info-content h3 {
  margin: 0;
  color: var(--fm-primary);
  font-size: 14px;
}

.meta-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--fm-muted);
  font-size: 13px;
}

.meta-item strong {
  color: var(--fm-text);
  text-align: right;
  word-break: break-all;
}

.code-pre {
  width: 100%;
  margin: 4px 0 0;
  padding: 6px;
  overflow-x: auto;
  border: 1px solid var(--fm-border);
  border-radius: 4px;
  background: var(--fm-panel-muted);
  font-family: monospace;
  font-size: 11px;
  text-align: left;
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

@media (max-width: 760px) {
  .fm-viewer-toolbar {
    bottom: 18px;
  }
}
</style>
