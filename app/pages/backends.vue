<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('backends.title') }}</h1>
        <p class="fm-page-subtitle">{{ t('backends.subtitle') }}</p>
      </div>
      <ElButton type="primary" @click="showAddDialog = true">{{ t('backends.add') }}</ElButton>
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
                <ElDropdownItem @click="testBackend(backend.id)">{{ t('backends.testConnection') }}</ElDropdownItem>
                <ElDropdownItem :disabled="backend.type !== 'comfyui'" @click="refreshResources(backend.id)">{{ t('backends.syncResources') }}</ElDropdownItem>
                <ElDropdownItem divided @click="removeBackend(backend.id)">{{ t('common.delete') }}</ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
        <div class="fm-card-body">
          <div class="fm-meta-row"><span class="fm-label">{{ t('backends.endpoint') }}</span><span class="fm-value">{{ backend.endpoint }}</span></div>
          <div class="fm-meta-row"><span class="fm-label">{{ t('backends.type') }}</span><span class="fm-value">{{ backend.type }}</span></div>
          <div class="fm-meta-row">
            <span class="fm-label">{{ t('backends.status') }}</span>
            <ElTag :type="statusTagType(backend.healthStatus)" size="small">{{ backend.healthStatus }}</ElTag>
          </div>
          <div class="fm-meta-row">
            <span class="fm-label">{{ t('backends.load') }}</span>
            <span class="fm-value">{{ backend.currentLoad }} / {{ backend.maxConcurrency }}</span>
          </div>
          <div v-if="backend.tags?.length" class="fm-tags">
            <ElTag v-for="tag in backend.tags" :key="tag" size="small" type="info">{{ tag }}</ElTag>
          </div>
        </div>
      </div>
    </div>

    <ElEmpty v-if="!backends.length && !loading" :description="t('backends.empty')" />

    <ElDialog v-model="showAddDialog" :title="t('backends.addDialog')" width="500px">
      <ElForm :model="form" label-width="100px">
        <ElFormItem :label="t('backends.name')" required>
          <ElInput v-model="form.name" placeholder="My ComfyUI Server" />
        </ElFormItem>
        <ElFormItem :label="t('backends.endpoint')" required>
          <ElInput v-model.trim="form.endpoint" :placeholder="form.type === 'provider' ? 'openai' : 'http://127.0.0.1:8188'" />
        </ElFormItem>
        <ElFormItem :label="t('backends.type')">
          <ElSelect v-model="form.type" style="width: 100%">
            <ElOption label="ComfyUI" value="comfyui" />
            <ElOption :label="t('providers.title')" value="provider" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="t('backends.maxConcurrency')">
          <ElInputNumber v-model="form.maxConcurrency" :min="1" :max="16" />
        </ElFormItem>
        <ElFormItem :label="t('backends.weight')">
          <ElInputNumber v-model="form.weight" :min="0.1" :max="10" :step="0.1" />
        </ElFormItem>
        <ElAlert
          v-if="form.type === 'provider'"
          class="fm-provider-hint"
          :title="t('backends.providerHint')"
          type="info"
          :closable="false" />
        <ElFormItem :label="t('backends.tags')">
          <ElInput v-model="form.tagsStr" :placeholder="t('backends.tagsPlaceholder')" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="showAddDialog = false">{{ t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" @click="addBackend">{{ t('backends.add') }}</ElButton>
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

const { t } = useI18n()
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

watch(() => form.type, (type) => {
  if (type === 'provider' && form.endpoint.startsWith('http')) form.endpoint = 'openai'
  if (type === 'comfyui' && !form.endpoint.startsWith('http')) form.endpoint = 'http://127.0.0.1:8188'
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
  const endpoint = form.endpoint.trim()
  if (!form.name || !endpoint) {
    ElMessage.warning(t('backends.fillNameEndpoint'))
    return
  }
  saving.value = true
  try {
    await $fetch('/api/v1/backends', {
        method: 'POST',
        body: {
          name: form.name,
          endpoint,
        type: form.type,
        maxConcurrency: form.maxConcurrency,
        weight: form.weight,
        tags: form.tagsStr ? form.tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []
      }
    })
    showAddDialog.value = false
    form.name = ''
    form.endpoint = form.type === 'provider' ? 'openai' : 'http://127.0.0.1:8188'
    form.tagsStr = ''
    await fetchBackends()
    ElMessage.success(t('backends.added'))
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('backends.addFailed'))
  } finally {
    saving.value = false
  }
}

async function testBackend(id: string) {
  ElMessage.info(t('backends.testing'))
  try {
    const result = await $fetch<{ ok: boolean; version?: string; error?: string }>(`/api/v1/backends/${id}/test`, { method: 'POST' })
    if (result.ok) {
      ElMessage.success(t('backends.testSucceeded', { version: result.version ? ' (v' + result.version + ')' : '' }))
    } else {
      ElMessage.error(t('backends.testFailed', { error: result.error }))
    }
    await fetchBackends()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('backends.testError'))
  }
}

async function refreshResources(id: string) {
  if (backends.value.find(backend => backend.id === id)?.type !== 'comfyui') {
    ElMessage.info(t('backends.providerNoResources'))
    return
  }
  ElMessage.info(t('backends.syncing'))
  try {
    const result = await $fetch<{ synced: number; errors: string[] }>(`/api/v1/backends/${id}/resources/refresh`, { method: 'POST' })
    ElMessage.success(t('backends.synced', { count: result.synced, errors: result.errors.length ? t('backends.syncErrors', { count: result.errors.length }) : '' }))
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('backends.syncFailed'))
  }
}

async function removeBackend(id: string) {
  await ElMessageBox.confirm(t('backends.deleteConfirm'), t('backends.deleteTitle'), { type: 'warning' })
  try {
    await $fetch(`/api/v1/backends/${id}`, { method: 'DELETE' })
    await fetchBackends()
    ElMessage.success(t('backends.deleted'))
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('backends.deleteFailed'))
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
.fm-provider-hint { margin-bottom: 14px; }
</style>
