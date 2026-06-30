<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { BatchDetail, BatchRun, ResultFile, ResultsResponse } from '~/types/gallery'
import { batchSubtitle, batchTitle } from '~/utils/gallery'

const route = useRoute()

const batchId = computed(() => String(route.params.id || ''))
const loading = ref(false)
const batch = ref<BatchRun | null>(null)
const results = ref<ResultFile[]>([])

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
      limit: '10000',
      offset: '0',
      includeTaskParams: 'true'
    })
    const response = await $fetch<ResultsResponse>(`/api/v1/results?${params}`)
    results.value = response.results
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '获取结果失败')
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
      <GalleryResultMatrix :results="results" @download="downloadResult" />
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
