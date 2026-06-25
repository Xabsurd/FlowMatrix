<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">运行</h1>
        <p class="fm-page-subtitle">文件会先在浏览器暂存；替换和删除只影响待运行队列，点击运行时才提交有效文件。</p>
      </div>
      <ElButton type="primary" :loading="submitting" @click="startRun">开始运行</ElButton>
    </div>

    <div class="fm-run-grid">
      <section class="fm-config-panel fm-card">
        <div class="fm-panel-heading">
          <span>运行配置</span>
          <ElTag v-if="selectedPreset" size="small" effect="plain">{{ scheduleModeLabel(selectedPreset.scheduleMode) }}</ElTag>
        </div>

        <ElForm label-position="top" class="fm-config-form">
          <ElFormItem label="调用配置">
            <ElSelect v-model="form.presetId" filterable placeholder="选择调用配置" style="width: 100%">
              <ElOption
                v-for="preset in presets"
                :key="preset.id"
                :label="preset.name"
                :value="preset.id"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="任务名称">
            <ElInput v-model="form.name" placeholder="留空则使用调用配置名称" />
          </ElFormItem>
          <ElFormItem label="组合模式">
            <ElSegmented v-model="form.mode" :options="modeOptions" />
          </ElFormItem>
        </ElForm>

        <div v-if="selectedPreset" class="fm-config-meta">
          <div class="fm-preset-summary">
            <div>
              <span>运行输入</span>
              <strong>{{ runtimeParams.length }}</strong>
            </div>
            <div>
              <span>固定参数</span>
              <strong>{{ fixedParamCount }}</strong>
            </div>
            <div>
              <span>预计任务</span>
              <strong>{{ estimatedTaskCount }}</strong>
            </div>
          </div>

          <div class="fm-config-note">
            <strong>{{ selectedPreset.name }}</strong>
            <span>{{ modeDescription(form.mode) }}</span>
          </div>
        </div>
      </section>

      <section class="fm-runtime-panel fm-card">
        <div class="fm-panel-heading">
          <span>运行时输入</span>
          <small v-if="runtimeParams.length">只填写这次运行会变化的内容</small>
        </div>

        <div v-if="runtimeParams.length" class="fm-runtime-list">
          <article
            v-for="param in runtimeParams"
            :key="paramKey(param)"
            class="fm-param-card"
          >
            <header class="fm-param-head">
              <div>
                <strong>{{ readableParamName(param) }}</strong>
                <span>{{ param.nodeType }} · {{ param.inferredType }}</span>
              </div>
              <ElTag size="small" effect="plain">{{ param.controlType }}</ElTag>
            </header>

            <div v-if="isFileParam(param)" class="fm-file-input">
              <div
                class="fm-upload-panel"
                :class="{ filled: fileBuckets[paramKey(param)]?.length }"
                role="button"
                tabindex="0"
                @click="openFilePicker(param)"
                @keydown.enter.prevent="openFilePicker(param)"
                @keydown.space.prevent="openFilePicker(param)"
                @dragover.prevent
                @drop.prevent="handleFileDrop($event, param)"
              >
                <div class="fm-upload-mark">{{ fileKindMark(param) }}</div>
                <div class="fm-upload-main">
                  <strong>{{ uploadTitle(param) }}</strong>
                  <span>{{ uploadHint(param) }}</span>
                </div>
                <div class="fm-upload-count">
                  <strong>{{ activeFiles(paramKey(param)).length }}</strong>
                  <span>有效</span>
                  <small v-if="deletedFiles(paramKey(param)).length">{{ deletedFiles(paramKey(param)).length }} 待删除</small>
                </div>
                <ElButton
                  v-if="fileBuckets[paramKey(param)]?.length"
                  size="small"
                  type="primary"
                  @click.stop="openFileDetails(param)"
                >
                  详情
                </ElButton>
                <ElButton v-else size="small" @click.stop="openFilePicker(param)">选择文件</ElButton>
              </div>
            </div>

            <div v-else class="fm-text-matrix">
              <ElInput
                v-model="matrixText[paramKey(param)]"
                type="textarea"
                :rows="param.controlType === 'textarea' ? 6 : 4"
                :placeholder="runtimePlaceholder(param)"
              />
              <div class="fm-input-foot">
                <span>{{ valueCount(matrixText[paramKey(param)]) }} 个值</span>
                <span>每行创建一个候选值</span>
              </div>
            </div>
          </article>
        </div>
        <ElEmpty v-else description="该配置没有运行时输入，开始运行会按固定参数创建 1 个任务。" />
      </section>
    </div>

    <ElDrawer
      v-model="fileDetailsVisible"
      title="上传文件详情"
      size="720px"
      class="fm-file-drawer"
      @closed="selectedRuntimeFile = null"
    >
      <div v-if="selectedFileParam" class="fm-file-detail-layout">
        <section class="fm-file-list-panel">
          <div class="fm-file-list-head">
            <div>
              <strong>{{ selectedFileParam.nodeType }}.{{ selectedFileParam.inputName }}</strong>
              <span>{{ activeFiles(selectedFileKey).length }} 个有效文件</span>
            </div>
            <ElButton size="small" @click="openFilePicker(selectedFileParam)">继续上传</ElButton>
          </div>

          <div v-if="fileBuckets[selectedFileKey]?.length" class="fm-file-list">
            <button
              v-for="file in fileBuckets[selectedFileKey]"
              :key="file.id"
              class="fm-file-row"
              :class="{ deleted: file.deleted, active: selectedRuntimeFile?.id === file.id }"
              type="button"
              @click="selectedRuntimeFile = file"
            >
              <span class="fm-file-name">{{ file.name }}</span>
              <span>{{ formatSize(file.size) }}</span>
              <ElTag size="small" :type="file.deleted ? 'info' : 'primary'" effect="plain">
                {{ file.deleted ? '待删除' : fileKindText(file) }}
              </ElTag>
            </button>
          </div>
          <ElEmpty v-else description="暂无文件" />
        </section>

        <section class="fm-file-inspector">
          <template v-if="selectedRuntimeFile">
            <img
              v-if="isImageFile(selectedRuntimeFile)"
              class="fm-file-preview"
              :src="selectedRuntimeFile.previewUrl"
              :alt="selectedRuntimeFile.name"
            >
            <div v-else class="fm-file-placeholder">
              {{ fileKindText(selectedRuntimeFile) }}
            </div>

            <dl class="fm-file-facts">
              <div>
                <dt>文件名</dt>
                <dd>{{ selectedRuntimeFile.name }}</dd>
              </div>
              <div>
                <dt>类型</dt>
                <dd>{{ selectedRuntimeFile.type || '未知类型' }}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{{ formatSize(selectedRuntimeFile.size) }}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{{ selectedRuntimeFile.deleted ? '点击运行时会忽略该文件' : '点击运行时会提交该文件' }}</dd>
              </div>
            </dl>

            <div class="fm-file-actions">
              <ElButton @click="openFilePicker(selectedFileParam, selectedRuntimeFile.id)">替换</ElButton>
              <ElButton v-if="selectedRuntimeFile.deleted" @click="selectedRuntimeFile.deleted = false">撤销删除</ElButton>
              <ElButton v-else type="danger" @click="selectedRuntimeFile.deleted = true">删除</ElButton>
            </div>
          </template>
          <ElEmpty v-else description="点击左侧文件查看详情" />
        </section>
      </div>
    </ElDrawer>

    <input
      ref="fileInputRef"
      class="fm-hidden-input"
      type="file"
      :accept="fileInputAccept"
      multiple
      @change="handleRuntimeFiles"
    >
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'

interface NodeParam {
  nodeId: string
  nodeType: string
  inputName: string
  inferredType: string
  controlType: string
  runtimeInput?: boolean
  defaultValue?: unknown
}

interface Preset {
  id: string
  workflowId: string
  name: string
  scheduleMode: string
  nodeParams: NodeParam[]
}

interface RuntimeFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  previewUrl?: string
  deleted: boolean
}

interface RuntimeAsset {
  storageDriver: string
  storageKey: string
  fileName: string
  mimeType: string
  fileSize: number
}

const presets = ref<Preset[]>([])
const submitting = ref(false)
const matrixText = reactive<Record<string, string>>({})
const fileBuckets = reactive<Record<string, RuntimeFile[]>>({})
const fileInputRef = ref<HTMLInputElement>()
const fileInputAccept = ref('')
const filePickerTarget = ref<{ key: string; param: NodeParam; replaceId?: string } | null>(null)
const fileDetailsVisible = ref(false)
const selectedFileKey = ref('')
const selectedFileParam = ref<NodeParam | null>(null)
const selectedRuntimeFile = ref<RuntimeFile | null>(null)
const form = reactive({
  presetId: '',
  name: '',
  mode: 'cartesian'
})
const modeOptions = [
  { label: '笛卡尔', value: 'cartesian' },
  { label: '逐行', value: 'zip' },
  { label: '表格', value: 'table' }
]

const selectedPreset = computed(() => presets.value.find(preset => preset.id === form.presetId))
const runtimeParams = computed(() => selectedPreset.value?.nodeParams.filter(param => param.runtimeInput) || [])
const fixedParamCount = computed(() => selectedPreset.value?.nodeParams.filter(param => !param.runtimeInput).length || 0)
const estimatedTaskCount = computed(() => {
  if (!runtimeParams.value.length) return 1
  const counts = runtimeParams.value.map(param => {
    const key = paramKey(param)
    return isFileParam(param) ? activeFiles(key).length : valueCount(matrixText[key])
  })
  if (counts.some(count => count === 0)) return '待填写'
  if (form.mode === 'cartesian') return counts.reduce((total, count) => total * count, 1)
  return Math.max(...counts)
})

watch(runtimeParams, params => {
  for (const param of params) {
    const key = paramKey(param)
    if (isFileParam(param)) {
      fileBuckets[key] ||= []
    } else if (!(key in matrixText)) {
      matrixText[key] = valueToText(param.defaultValue)
    }
  }
}, { immediate: true })

async function fetchPresets() {
  presets.value = await $fetch<Preset[]>('/api/v1/presets')
  form.presetId = presets.value[0]?.id || ''
}

function openFilePicker(param: NodeParam, replaceId?: string) {
  const key = paramKey(param)
  filePickerTarget.value = { key, param, replaceId }
  fileInputAccept.value = fileAccept(param)
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

function handleRuntimeFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const target = filePickerTarget.value
  if (!target || !input.files?.length) return
  addFilesToBucket(Array.from(input.files), target)
  filePickerTarget.value = null
}

function handleFileDrop(event: DragEvent, param: NodeParam) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) return
  addFilesToBucket(files, { key: paramKey(param), param })
}

function addFilesToBucket(incoming: File[], target: { key: string; param: NodeParam; replaceId?: string }) {
  const files = incoming.filter(file => isAllowedFile(file, target.param))
  if (!files.length) {
    ElMessage.warning(`请选择${fileTypeLabel(target.param)}文件`)
    return
  }

  const bucket = fileBuckets[target.key] ?? (fileBuckets[target.key] = [])

  if (target.replaceId) {
    const index = bucket.findIndex(file => file.id === target.replaceId)
    if (index >= 0) {
      revokeFile(bucket[index]!)
      const nextFile = createRuntimeFile(files[0]!)
      bucket[index] = nextFile
      selectedRuntimeFile.value = nextFile
    }
  } else {
    const added = files.map(createRuntimeFile)
    bucket.push(...added)
    selectedRuntimeFile.value ||= added[0] || null
  }
}

async function startRun() {
  const preset = selectedPreset.value
  if (!preset) {
    ElMessage.warning('请先选择调用配置')
    return
  }

  submitting.value = true
  try {
    const params: Record<string, unknown[]> = {}
    for (const param of runtimeParams.value) {
      const key = paramKey(param)
      if (isFileParam(param)) {
        const files = activeFiles(key)
        if (!files.length) {
          ElMessage.warning(`请为 ${param.nodeType}.${param.inputName} 上传${fileTypeLabel(param)}文件`)
          return
        }
        params[key] = await uploadRuntimeFiles(files)
      } else {
        const values = parseMatrixValues(matrixText[key] || '', param)
        if (!values.length) {
          ElMessage.warning(`请填写 ${param.nodeType}.${param.inputName}`)
          return
        }
        params[key] = values
      }
    }

    const run = await $fetch<{ id: string }>('/api/v1/batch', {
      method: 'POST',
      body: {
        name: form.name,
        presetId: preset.id,
        workflowId: preset.workflowId,
        scheduleMode: preset.scheduleMode,
        matrix: {
          mode: form.mode,
          params
        }
      }
    })
    ElMessage.success('任务已创建')
    await navigateTo(`/runs/${run.id}`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '创建失败')
  } finally {
    submitting.value = false
  }
}

async function uploadRuntimeFiles(files: RuntimeFile[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file.file, file.name)
  }
  return await $fetch<RuntimeAsset[]>('/api/v1/runtime-assets', {
    method: 'POST',
    body: formData
  })
}

function createRuntimeFile(file: File): RuntimeFile {
  const image = file.type.startsWith('image/')
  return {
    id: createRuntimeId(),
    name: file.name,
    size: file.size,
    type: file.type,
    file,
    previewUrl: image ? URL.createObjectURL(file) : undefined,
    deleted: false
  }
}

function createRuntimeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint32Array(4)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('-')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function activeFiles(key: string) {
  return (fileBuckets[key] || []).filter(file => !file.deleted)
}

function deletedFiles(key: string) {
  return (fileBuckets[key] || []).filter(file => file.deleted)
}

function revokeFile(file: RuntimeFile) {
  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
}

function isFileParam(param: NodeParam) {
  return param.inferredType === 'IMAGE' || param.inferredType === 'FILE' || param.controlType === 'file-upload'
}

function openFileDetails(param: NodeParam) {
  const key = paramKey(param)
  selectedFileKey.value = key
  selectedFileParam.value = param
  selectedRuntimeFile.value = activeFiles(key)[0] || fileBuckets[key]?.[0] || null
  fileDetailsVisible.value = true
}

function fileAccept(param: NodeParam) {
  const kind = fileKind(param)
  if (kind === 'image') return 'image/png,image/jpeg,image/webp,image/gif'
  if (kind === 'video') return 'video/*'
  if (kind === 'audio') return 'audio/*'
  if (kind === 'json') return '.json,application/json'
  return ''
}

function fileKind(param: NodeParam) {
  const name = param.inputName.toLowerCase()
  if (param.inferredType === 'IMAGE' || name.includes('image') || name.includes('mask') || name.includes('photo') || name.includes('picture')) return 'image'
  if (name.includes('video')) return 'video'
  if (name.includes('audio') || name.includes('sound')) return 'audio'
  if (name.includes('json') || param.inferredType === 'JSON') return 'json'
  return 'file'
}

function fileTypeLabel(param: NodeParam) {
  const labels: Record<string, string> = {
    image: '图片',
    video: '视频',
    audio: '音频',
    json: 'JSON',
    file: ''
  }
  return labels[fileKind(param)] ?? ''
}

function uploadTitle(param: NodeParam) {
  return `上传${fileTypeLabel(param) || '运行'}文件`
}

function uploadHint(param: NodeParam) {
  const label = fileTypeLabel(param) || '任意'
  return `点击或拖拽${label}文件到这里，文件会在点击运行时提交。`
}

function fileKindMark(param: NodeParam) {
  const marks: Record<string, string> = {
    image: 'IMG',
    video: 'VID',
    audio: 'AUD',
    json: 'JSON',
    file: 'FILE'
  }
  return marks[fileKind(param)] ?? 'FILE'
}

function isAllowedFile(file: File, param: NodeParam) {
  const kind = fileKind(param)
  if (kind === 'image') return file.type.startsWith('image/')
  if (kind === 'video') return file.type.startsWith('video/')
  if (kind === 'audio') return file.type.startsWith('audio/')
  if (kind === 'json') return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')
  return true
}

function isImageFile(file: RuntimeFile) {
  return file.type.startsWith('image/') && Boolean(file.previewUrl)
}

function fileKindText(file: RuntimeFile) {
  if (file.type.startsWith('image/')) return '图片'
  if (file.type.startsWith('video/')) return '视频'
  if (file.type.startsWith('audio/')) return '音频'
  if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) return 'JSON'
  return file.type || '文件'
}

function paramKey(param: NodeParam) {
  return `${param.nodeId}.${param.inputName}`
}

function runtimePlaceholder(param: NodeParam) {
  if (param.controlType === 'textarea') return '每一行作为一个运行值'
  return `每行一个值，例如：${valueToText(param.defaultValue) || param.inferredType}`
}

function readableParamName(param: NodeParam) {
  const labels: Record<string, string> = {
    text: '提示词',
    positive: '正向提示词',
    negative: '反向提示词',
    seed: '随机种子',
    steps: '采样步数',
    cfg: 'CFG',
    width: '宽度',
    height: '高度',
    image: '图片',
    mask: '蒙版',
    file: '文件'
  }
  const name = param.inputName.toLowerCase()
  const matched = Object.entries(labels).find(([key]) => name.includes(key))
  return matched?.[1] || param.inputName
}

function valueCount(text = '') {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).length
}

function modeDescription(mode: string) {
  if (mode === 'zip') return '逐行模式会按第 1 行配第 1 个文件/值、第 2 行配第 2 个文件/值来创建任务。'
  if (mode === 'table') return '表格模式会把每一行作为一条完整输入记录。'
  return '笛卡尔模式会把每个输入的所有值互相组合，适合批量探索参数。'
}

function scheduleModeLabel(mode: string) {
  const labels: Record<string, string> = {
    'idle-first': '空闲优先',
    'least-queue': '最少队列',
    'resource-match': '资源匹配',
    smart: '智能调度'
  }
  return labels[mode] || mode
}

function parseMatrixValues(text: string, param: NodeParam) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(value => parseValue(value, param.inferredType))
}

function parseValue(value: string, inferredType: string) {
  if (inferredType === 'INT' || inferredType === 'SEED') return Number.parseInt(value, 10)
  if (inferredType === 'FLOAT') return Number.parseFloat(value)
  if (inferredType === 'BOOLEAN') return value === 'true' || value === '1' || value === '是'
  if (inferredType === 'JSON') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}

function valueToText(value: unknown) {
  if (value === undefined || value === null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onMounted(fetchPresets)
onBeforeUnmount(() => {
  for (const bucket of Object.values(fileBuckets)) {
    for (const file of bucket) revokeFile(file)
  }
})
</script>

<style scoped>
.fm-run-grid { display: grid; gap: 16px; align-items: start; }
.fm-config-panel { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.fm-runtime-panel { display: grid; gap: 16px; }
.fm-page-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}
.fm-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.fm-panel-heading span { color: var(--fm-text); font-size: 16px; font-weight: 700; }
.fm-panel-heading small { color: var(--fm-muted); font-size: 12px; }
.fm-config-form { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr) max-content; gap: 12px; align-items: end; min-width: 0; }
.fm-config-form :deep(.el-form-item) { margin-bottom: 0; }
.fm-config-meta { display: grid; gap: 8px; min-width: 0; }
.fm-preset-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.fm-preset-summary div { display: grid; gap: 5px; min-width: 0; padding: 10px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent); }
.fm-preset-summary span { color: var(--fm-muted); font-size: 12px; }
.fm-preset-summary strong { overflow: hidden; color: var(--fm-text); font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.fm-config-note { display: grid; gap: 6px; padding: 12px; border: 1px solid color-mix(in srgb, var(--fm-primary) 26%, var(--fm-border)); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-primary) 9%, var(--fm-panel-muted)); }
.fm-config-note strong { overflow: hidden; color: var(--fm-text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.fm-config-note span { color: var(--fm-muted); font-size: 12px; line-height: 1.55; }
.fm-runtime-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
.fm-param-card { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 64%, transparent); }
.fm-param-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.fm-param-head div { display: grid; gap: 4px; min-width: 0; }
.fm-param-head strong { overflow: hidden; color: var(--fm-text); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.fm-param-head span { color: var(--fm-muted); font-size: 12px; overflow-wrap: anywhere; }
.fm-text-matrix { display: grid; gap: 8px; }
.fm-input-foot { display: flex; justify-content: space-between; gap: 12px; color: var(--fm-muted); font-size: 12px; }
.fm-file-input { display: grid; gap: 12px; width: 100%; }
.fm-upload-panel { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto auto; align-items: center; gap: 14px; width: 100%; min-height: 96px; padding: 16px; border: 1px dashed var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 76%, transparent); color: var(--fm-muted); cursor: pointer; transition: border-color 160ms ease, background 160ms ease, transform 160ms ease; }
.fm-upload-panel:hover,
.fm-upload-panel:focus-visible { border-color: var(--fm-accent); background: color-mix(in srgb, var(--fm-accent) 12%, var(--fm-panel-muted)); outline: none; }
.fm-upload-panel.filled { border-style: solid; border-color: color-mix(in srgb, var(--fm-accent) 42%, var(--fm-border)); }
.fm-upload-mark { display: grid; place-items: center; width: 54px; height: 54px; border: 1px solid var(--fm-border); border-radius: 12px; background: color-mix(in srgb, var(--fm-accent) 12%, transparent); color: var(--fm-text); font-size: 12px; font-weight: 700; }
.fm-upload-main { display: grid; gap: 4px; min-width: 0; }
.fm-upload-main strong { color: var(--fm-text); font-size: 15px; }
.fm-upload-main span { color: var(--fm-muted); font-size: 13px; overflow-wrap: anywhere; }
.fm-upload-count { display: grid; gap: 2px; min-width: 72px; color: var(--fm-muted); text-align: right; }
.fm-upload-count strong { color: var(--fm-text); font-size: 24px; line-height: 1; }
.fm-upload-count span,
.fm-upload-count small { font-size: 12px; }
.fm-file-detail-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(240px, 0.9fr); gap: 14px; min-height: 420px; }
.fm-file-list-panel,
.fm-file-inspector { min-width: 0; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 70%, transparent); }
.fm-file-list-panel { display: flex; flex-direction: column; overflow: hidden; }
.fm-file-list-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border-bottom: 1px solid var(--fm-border); }
.fm-file-list-head div { display: grid; gap: 3px; min-width: 0; }
.fm-file-list-head strong { overflow: hidden; color: var(--fm-text); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.fm-file-list-head span { color: var(--fm-muted); font-size: 12px; }
.fm-file-list { display: flex; flex-direction: column; gap: 6px; padding: 10px; overflow: auto; }
.fm-file-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 1px solid transparent; border-radius: var(--fm-radius); background: transparent; color: var(--fm-muted); text-align: left; cursor: pointer; }
.fm-file-row:hover,
.fm-file-row.active { border-color: color-mix(in srgb, var(--fm-accent) 42%, var(--fm-border)); background: color-mix(in srgb, var(--fm-accent) 12%, transparent); color: var(--fm-text); }
.fm-file-row.deleted { opacity: 0.5; }
.fm-file-name { overflow: hidden; color: var(--fm-text); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.fm-file-inspector { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.fm-file-preview,
.fm-file-placeholder { width: 100%; aspect-ratio: 4 / 3; border-radius: var(--fm-radius); background: var(--fm-panel-muted); }
.fm-file-preview { object-fit: contain; }
.fm-file-placeholder { display: grid; place-items: center; color: var(--fm-muted); font-size: 18px; }
.fm-file-facts { display: grid; gap: 8px; margin: 0; }
.fm-file-facts div { display: grid; gap: 3px; min-width: 0; }
.fm-file-facts dt { color: var(--fm-muted); font-size: 12px; }
.fm-file-facts dd { min-width: 0; margin: 0; color: var(--fm-text); font-size: 13px; overflow-wrap: anywhere; }
.fm-file-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; }
.fm-hidden-input { display: none; }
@media (max-width: 1180px) {
  .fm-config-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .fm-page-header,
  .fm-config-panel,
  .fm-runtime-list { grid-template-columns: 1fr; }
  .fm-upload-panel { grid-template-columns: 44px minmax(0, 1fr); }
  .fm-upload-count { text-align: left; }
  .fm-file-detail-layout { grid-template-columns: 1fr; }
}
</style>
