<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">执行后端</h1>
        <p class="fm-page-subtitle">管理 ComfyUI 执行后端。支持连接测试、资源同步和多后端调度。</p>
      </div>
      <ElButton type="primary" @click="showAddDialog = true">添加后端</ElButton>
    </div>

    <div class="fm-card-grid">
      <div v-for="backend in backends" :key="backend.id" class="fm-card">
        <div class="fm-card-header">
          <div class="fm-card-title-row">
            <span class="fm-status-dot" :class="backend.healthStatus" />
            <h3>{{ backend.name }}</h3>
          </div>
          <ElDropdown>
            <ElButton text circle>
              <FmIcon name="moreVertical" />
            </ElButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem @click="testBackend(backend.id)">测试连接</ElDropdownItem>
                <ElDropdownItem @click="refreshResources(backend.id)">同步资源</ElDropdownItem>
                <ElDropdownItem divided @click="removeBackend(backend.id)">删除</ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
        <div class="fm-card-body">
          <div class="fm-meta-row"><span class="fm-label">端点</span><span class="fm-value">{{ backend.endpoint }}</span></div>
          <div class="fm-meta-row"><span class="fm-label">类型</span><span class="fm-value">{{ backend.type }}</span></div>
          <div class="fm-meta-row">
            <span class="fm-label">状态</span>
            <ElTag :type="statusTagType(backend.healthStatus)" size="small">{{ backend.healthStatus }}</ElTag>
          </div>
          <div class="fm-meta-row">
            <span class="fm-label">负载</span>
            <span class="fm-value">{{ backend.currentLoad }} / {{ backend.maxConcurrency }}</span>
          </div>
          <div v-if="backend.tags?.length" class="fm-tags">
            <ElTag v-for="tag in backend.tags" :key="tag" size="small" type="info">{{ tag }}</ElTag>
          </div>
        </div>
      </div>
    </div>

    <ElEmpty v-if="!backends.length && !loading" description="暂无执行后端，点击「添加后端」开始配置。" />

    <!-- Add Backend Dialog -->
    <ElDialog v-model="showAddDialog" title="添加执行后端" width="500px">
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="名称" required>
          <ElInput v-model="form.name" placeholder="My ComfyUI Server" />
        </ElFormItem>
        <ElFormItem label="端点" required>
          <ElInput v-model="form.endpoint" placeholder="http://127.0.0.1:8188" />
        </ElFormItem>
        <ElFormItem label="类型">
          <ElSelect v-model="form.type" style="width: 100%">
            <ElOption label="ComfyUI" value="comfyui" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="最大并发">
          <ElInputNumber v-model="form.maxConcurrency" :min="1" :max="16" />
        </ElFormItem>
        <ElFormItem label="权重">
          <ElInputNumber v-model="form.weight" :min="0.1" :max="10" :step="0.1" />
        </ElFormItem>
        <ElFormItem label="标签">
          <ElInput v-model="form.tagsStr" placeholder="gpu,4090 (逗号分隔)" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="showAddDialog = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="addBackend">添加</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

interface Backend {
  id: string
  name: string
  endpoint: string
  type: string
  healthStatus: string
  enabled: boolean
  currentLoad: number
  maxConcurrency: number
  weight: number
  tags: string[]
}

const backends = ref<Backend[]>([])
const loading = ref(false)
const showAddDialog = ref(false)
const saving = ref(false)
const form = reactive({
  name: '',
  endpoint: 'http://127.0.0.1:8188',
  type: 'comfyui',
  maxConcurrency: 2,
  weight: 1,
  tagsStr: ''
})

async function fetchBackends() {
  loading.value = true
  try {
    backends.value = await $fetch<Backend[]>('/api/v1/backends')
  } finally {
    loading.value = false
  }
}

async function addBackend() {
  if (!form.name || !form.endpoint) {
    ElMessage.warning('请填写名称和端点')
    return
  }
  saving.value = true
  try {
    await $fetch('/api/v1/backends', {
      method: 'POST',
      body: {
        name: form.name,
        endpoint: form.endpoint,
        type: form.type,
        maxConcurrency: form.maxConcurrency,
        weight: form.weight,
        tags: form.tagsStr ? form.tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []
      }
    })
    showAddDialog.value = false
    form.name = ''
    form.endpoint = 'http://127.0.0.1:8188'
    form.tagsStr = ''
    await fetchBackends()
    ElMessage.success('后端已添加')
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '添加失败')
  } finally {
    saving.value = false
  }
}

async function testBackend(id: string) {
  ElMessage.info('正在测试连接...')
  try {
    const result = await $fetch<{ ok: boolean; version?: string; error?: string }>(`/api/v1/backends/${id}/test`, { method: 'POST' })
    if (result.ok) {
      ElMessage.success(`连接成功${result.version ? ` (v${result.version})` : ''}`)
    } else {
      ElMessage.error(`连接失败: ${result.error}`)
    }
    await fetchBackends()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '测试失败')
  }
}

async function refreshResources(id: string) {
  ElMessage.info('正在同步资源...')
  try {
    const result = await $fetch<{ synced: number; errors: string[] }>(`/api/v1/backends/${id}/resources/refresh`, { method: 'POST' })
    ElMessage.success(`已同步 ${result.synced} 个资源${result.errors.length ? `，${result.errors.length} 个错误` : ''}`)
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '同步失败')
  }
}

async function removeBackend(id: string) {
  await ElMessageBox.confirm('确定删除该后端？关联的资源和健康记录也会被删除。', '确认删除', { type: 'warning' })
  try {
    await $fetch(`/api/v1/backends/${id}`, { method: 'DELETE' })
    await fetchBackends()
    ElMessage.success('已删除')
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}

function statusTagType(status: string) {
  switch (status) {
    case 'healthy': return 'success'
    case 'unhealthy': return 'danger'
    case 'maintenance': return 'warning'
    default: return 'info'
  }
}

onMounted(fetchBackends)
</script>

<style scoped>
.fm-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.fm-card-title-row { display: flex; align-items: center; gap: 8px; }
.fm-card-title-row h3 { margin: 0; font-size: 16px; }
.fm-card-body { display: flex; flex-direction: column; gap: 8px; }
.fm-meta-row { display: flex; justify-content: space-between; font-size: 13px; }
.fm-label { color: var(--fm-muted); }
.fm-value { color: var(--fm-text); font-family: monospace; }
.fm-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.fm-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fm-muted); flex-shrink: 0; }
.fm-status-dot.healthy { background: var(--fm-success); }
.fm-status-dot.unhealthy { background: var(--fm-danger); }
.fm-status-dot.maintenance { background: var(--fm-warning); }
</style>
