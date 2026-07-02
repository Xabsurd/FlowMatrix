<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<template>
  <section class="fm-online-run fm-card">
    <div class="fm-panel-heading">
      <div>
        <span>{{ $t('onlineRun.title') }}</span>
        <small>{{ $t('onlineRun.subtitle') }}</small>
      </div>
      <ElButton type="primary" :loading="submitting" @click="startRun">{{ $t('onlineRun.submit') }}</ElButton>
    </div>

    <ElForm label-position="top" class="online-form">
      <div class="online-grid">
        <ElFormItem :label="$t('onlineRun.mode')">
          <ElSegmented v-model="form.mode" :options="modeOptions" />
        </ElFormItem>
        <ElFormItem :label="$t('onlineRun.backend')">
          <ElSelect v-model="form.backendId" filterable :placeholder="$t('onlineRun.backendPlaceholder')" style="width: 100%">
            <ElOption
              v-for="backend in providerBackends"
              :key="backend.id"
              :label="backendOptionLabel(backend)"
              :value="backend.id"
              :disabled="!backend.enabled || backend.paused" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="$t('onlineRun.taskName')">
          <ElInput v-model="form.name" :placeholder="$t('onlineRun.optional')" />
        </ElFormItem>
      </div>

      <div class="online-grid">
        <ElFormItem :label="$t('onlineRun.model')">
          <ElInput v-model.trim="form.model" :placeholder="$t('onlineRun.modelPlaceholder')" />
        </ElFormItem>
        <ElFormItem :label="$t('onlineRun.size')">
          <ElSelect v-model="form.size" style="width: 100%">
            <ElOption label="1024 x 1024" value="1024x1024" />
            <ElOption label="1024 x 1536" value="1024x1536" />
            <ElOption label="1536 x 1024" value="1536x1024" />
            <ElOption :label="$t('onlineRun.auto')" value="auto" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="$t('onlineRun.outputsPerPrompt')">
          <ElInputNumber v-model="form.n" :min="1" :max="10" />
        </ElFormItem>
      </div>

      <div class="online-grid">
        <ElFormItem :label="$t('onlineRun.quality')">
          <ElSelect v-model="form.quality" style="width: 100%">
            <ElOption :label="$t('onlineRun.auto')" value="auto" />
            <ElOption :label="$t('onlineRun.low')" value="low" />
            <ElOption :label="$t('onlineRun.medium')" value="medium" />
            <ElOption :label="$t('onlineRun.high')" value="high" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="$t('onlineRun.format')">
          <ElSelect v-model="form.outputFormat" style="width: 100%">
            <ElOption label="PNG" value="png" />
            <ElOption label="WEBP" value="webp" />
            <ElOption label="JPEG" value="jpeg" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="form.mode === 'image-to-image'" :label="$t('onlineRun.imagesPerGroup')">
          <ElInputNumber v-model="form.groupSize" :min="1" :max="16" />
        </ElFormItem>
      </div>

      <ElFormItem :label="$t('onlineRun.prompt')">
        <ElInput
          v-model="form.promptsText"
          type="textarea"
          :rows="10"
          :placeholder="$t('onlineRun.promptPlaceholder')" />
      </ElFormItem>

      <div v-if="form.mode === 'image-to-image'" class="image-groups">
        <div class="upload-card" role="button" tabindex="0" @click="openFilePicker" @keydown.enter.prevent="openFilePicker" @keydown.space.prevent="openFilePicker">
          <strong>{{ $t('onlineRun.chooseImages') }}</strong>
          <span>{{ $t('onlineRun.imageGroupHint', { count: form.groupSize }) }}</span>
          <em>{{ $t('onlineRun.imageGroupCount', { images: selectedFiles.length, groups: imageGroups.length }) }}</em>
        </div>
        <input ref="fileInputRef" class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="handleFiles">
        <div v-if="imageGroups.length" class="group-preview">
          <div v-for="(group, index) in imageGroups.slice(0, 12)" :key="index" class="group-chip">
            <strong>{{ $t('onlineRun.group', { index: index + 1 }) }}</strong>
            <span>{{ $t('onlineRun.imageCount', { count: group.length }) }}</span>
          </div>
          <span v-if="imageGroups.length > 12" class="group-more">{{ $t('onlineRun.moreGroups', { count: imageGroups.length - 12 }) }}</span>
        </div>
      </div>

      <div class="run-summary">
        <div>
          <span>{{ $t('onlineRun.promptCount') }}</span>
          <strong>{{ prompts.length }}</strong>
        </div>
        <div>
          <span>{{ $t('onlineRun.inputGroups') }}</span>
          <strong>{{ form.mode === 'image-to-image' ? imageGroups.length : '-' }}</strong>
        </div>
        <div>
          <span>{{ $t('onlineRun.estimatedOutputs') }}</span>
          <strong>{{ estimatedOutputs }}</strong>
        </div>
      </div>
    </ElForm>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'

interface Backend {
  id: string
  name: string
  type: string
  enabled: boolean
  paused?: boolean
  healthStatus: string
}

interface RuntimeAsset {
  storageDriver: string
  storageKey: string
  fileName: string
  mimeType: string
  fileSize: number
}

const { t } = useI18n()
const backends = ref<Backend[]>([])
const submitting = ref(false)
const selectedFiles = ref<File[]>([])
const fileInputRef = ref<HTMLInputElement>()

const form = reactive({
  mode: 'text-to-image' as 'text-to-image' | 'image-to-image',
  backendId: '',
  name: '',
  model: '',
  size: '1024x1024',
  quality: 'auto',
  outputFormat: 'png',
  n: 1,
  groupSize: 1,
  promptsText: ''
})

const modeOptions = computed(() => [
  { label: t('onlineRun.textToImage'), value: 'text-to-image' },
  { label: t('onlineRun.imageToImage'), value: 'image-to-image' }
])

const providerBackends = computed(() => backends.value.filter(backend => backend.type === 'provider'))
const prompts = computed(() => form.promptsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
const imageGroups = computed(() => {
  const size = Math.max(1, Math.min(16, Number(form.groupSize || 1)))
  const groups: File[][] = []
  for (let i = 0; i < selectedFiles.value.length; i += size) {
    groups.push(selectedFiles.value.slice(i, i + size))
  }
  return groups.filter(group => group.length === size)
})
const estimatedOutputs = computed(() => prompts.value.length * Number(form.n || 1))

watch(providerBackends, (items) => {
  if (!form.backendId && items[0]) form.backendId = items[0].id
}, { immediate: true })

async function fetchBackends() {
  backends.value = await $fetch<Backend[]>('/api/v1/backends')
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFiles.value = Array.from(input.files || []).filter(file => file.type.startsWith('image/'))
}

async function startRun() {
  if (!form.backendId) {
    ElMessage.warning(t('onlineRun.selectBackendFirst'))
    return
  }
  if (!prompts.value.length) {
    ElMessage.warning(t('onlineRun.enterPromptFirst'))
    return
  }
  if (form.mode === 'image-to-image' && imageGroups.value.length !== prompts.value.length) {
    ElMessage.warning(t('onlineRun.imageGroupMismatch', { prompts: prompts.value.length, groups: imageGroups.value.length }))
    return
  }

  submitting.value = true
  try {
    const uploadedGroups = form.mode === 'image-to-image'
      ? await uploadImageGroups(imageGroups.value)
      : []
    const run = await $fetch<{ id: string }>('/api/v1/providers/openai/batch', {
      method: 'POST',
      body: {
        name: form.name,
        backendId: form.backendId,
        mode: form.mode,
        prompts: prompts.value,
        imageGroups: uploadedGroups,
        model: form.model || undefined,
        size: form.size,
        quality: form.quality,
        outputFormat: form.outputFormat,
        n: form.n
      }
    })
    ElMessage.success(t('onlineRun.created'))
    await navigateTo(`/gallery?batchRunId=${run.id}`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('run.createFailed'))
  } finally {
    submitting.value = false
  }
}

async function uploadImageGroups(groups: File[][]) {
  const result: RuntimeAsset[][] = []
  for (const group of groups) {
    const formData = new FormData()
    for (const file of group) formData.append('files', file, file.name)
    result.push(await $fetch<RuntimeAsset[]>('/api/v1/runtime-assets', {
      method: 'POST',
      body: formData
    }))
  }
  return result
}

function backendOptionLabel(backend: Backend) {
  const state = !backend.enabled ? t('run.backendDisabled') : backend.paused ? t('run.backendPaused') : backend.healthStatus || 'unknown'
  return `${backend.name} · ${state}`
}

onMounted(fetchBackends)
</script>

<style scoped>
.fm-online-run,
.online-form {
  display: grid;
  gap: 16px;
}

.fm-panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.fm-panel-heading > div {
  display: grid;
  gap: 4px;
}

.fm-panel-heading span {
  color: var(--fm-text);
  font-size: 16px;
  font-weight: 700;
}

.fm-panel-heading small {
  color: var(--fm-muted);
  font-size: 12px;
}

.online-grid,
.run-summary {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.online-grid :deep(.el-form-item) {
  margin-bottom: 0;
}

.image-groups {
  display: grid;
  gap: 10px;
}

.upload-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px dashed var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent);
  cursor: pointer;
}

.upload-card strong,
.run-summary strong {
  color: var(--fm-text);
}

.upload-card span,
.upload-card em,
.run-summary span,
.group-chip span,
.group-more {
  color: var(--fm-muted);
  font-size: 12px;
}

.hidden-input {
  display: none;
}

.group-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-chip {
  display: grid;
  gap: 3px;
  min-width: 90px;
  padding: 8px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 64%, transparent);
}

.run-summary div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 68%, transparent);
}

@media (max-width: 900px) {
  .fm-panel-heading,
  .online-grid,
  .run-summary {
    grid-template-columns: 1fr;
  }

  .fm-panel-heading {
    display: grid;
  }
}
</style>
