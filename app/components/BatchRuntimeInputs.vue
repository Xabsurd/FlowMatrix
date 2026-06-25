<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="fm-runtime-panel fm-card">
    <div class="fm-panel-heading">
      <span>运行时输入</span>
      <small v-if="params.length">每个参数维护一组候选值，运行会记录本次提交的参数。</small>
    </div>

    <div v-if="params.length" class="fm-runtime-table">
      <article v-for="param in params" :key="paramKey(param)" class="fm-runtime-row">
        <div class="fm-runtime-param">
          <div>
            <strong>{{ readableParamName(param) }}</strong>
            <span>{{ param.nodeType }} · {{ param.inferredType }}</span>
          </div>
          <ElTag size="small" effect="plain">{{ param.controlType }}</ElTag>
        </div>

        <div class="fm-runtime-values">
          <template v-if="candidateCount(param)">
            <ElTag v-for="candidate in candidatePreview(param)" :key="candidate.id" size="small" effect="plain">
              {{ candidateLabel(candidate, param) }}
            </ElTag>
            <span v-if="candidateCount(param) > 4" class="fm-more-count">+{{ candidateCount(param) - 4 }}</span>
          </template>
          <span v-else class="fm-runtime-empty">未添加候选值</span>
        </div>

        <div class="fm-runtime-actions">
          <ElButton :size="rowActionSize" type="primary" @click="openEditor(param)">编辑</ElButton>
          <ElButton :size="rowActionSize" @click="clearParamValues(param)">清空</ElButton>
        </div>
      </article>
    </div>
    <ElEmpty v-else description="该配置没有运行时输入，开始运行会按固定参数创建 1 个任务。" />

    <ElDialog
      v-model="editorVisible"
      :title="editingParam ? `编辑 ${readableParamName(editingParam)}` : '编辑运行输入'"
      width="720px"
      append-to-body>
      <div v-if="editingParam" class="fm-value-editor">
        <div class="fm-editor-head">
          <div>
            <strong>{{ editingParam.nodeType }}.{{ editingParam.inputName }}</strong>
            <span>{{ editorHelp(editingParam) }}</span>
          </div>
          <ElTag effect="plain">{{ editingParam.inferredType }}</ElTag>
        </div>

        <template v-if="isFileParam(editingParam)">
          <div
            class="fm-upload-panel"
            :class="{ filled: activeFiles(editingKey).length }"
            role="button"
            tabindex="0"
            @click="openFilePicker(editingParam)"
            @keydown.enter.prevent="openFilePicker(editingParam)"
            @keydown.space.prevent="openFilePicker(editingParam)"
            @dragover.prevent
            @drop.prevent="handleFileDrop($event, editingParam)">
            <div class="fm-upload-mark">{{ fileKindMark(editingParam) }}</div>
            <div class="fm-upload-main">
              <strong>{{ uploadTitle(editingParam) }}</strong>
              <span>{{ uploadHint(editingParam) }}</span>
            </div>
            <div class="fm-upload-count">
              <strong>{{ activeFiles(editingKey).length }}</strong>
              <span>有效</span>
            </div>
          </div>
        </template>

        <template v-else-if="isModelParam(editingParam)">
          <div class="fm-editor-adder">
            <ElSelect
              v-model="modelDraft"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              :loading="resourceLoading"
              placeholder="选择一个或多个资源"
              style="width: 100%">
              <ElOption
                v-for="resource in resourceOptionsFor(editingParam)"
                :key="`${resource.backendId}-${resource.name}`"
                :label="resource.name"
                :value="resource.name">
                <span>{{ resource.name }}</span>
                <small class="fm-option-meta">{{ resource.type }}</small>
              </ElOption>
            </ElSelect>
            <ElButton type="primary" @click="addModelDraft">添加</ElButton>
          </div>
        </template>

        <template v-else>
          <div class="fm-editor-adder">
            <ElInput
              v-model="textDraft"
              :type="editingParam.controlType === 'textarea' ? 'textarea' : 'text'"
              :rows="editingParam.controlType === 'textarea' ? 5 : undefined"
              :placeholder="singleValuePlaceholder(editingParam)"
              @keydown.enter.exact.prevent="addTextDraft" />
            <ElButton type="primary" @click="addTextDraft">添加</ElButton>
          </div>
        </template>

        <div class="fm-candidate-list">
          <div class="fm-candidate-head">
            <strong>候选值</strong>
            <span>{{ candidateCount(editingParam) }} 个</span>
          </div>
          <div v-if="editorCandidates.length" class="fm-candidate-items">
            <div v-for="candidate in editorCandidates" :key="candidate.id" class="fm-candidate-row">
              <span>{{ candidateLabel(candidate, editingParam) }}</span>
              <ElButton :size="rowActionSize" text type="danger" @click="removeCandidate(editingParam, candidate.id)">删除</ElButton>
            </div>
          </div>
          <ElEmpty v-else description="还没有候选值，先在上方添加。" />
        </div>
      </div>
      <template #footer>
        <ElButton @click="editorVisible = false">完成</ElButton>
      </template>
    </ElDialog>

    <input ref="fileInputRef" class="fm-hidden-input" type="file" :accept="fileInputAccept" multiple @change="handleRuntimeFiles">
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
  backendId?: string | null
  backendGroupId?: string | null
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

interface Backend {
  id: string
  name: string
  type: string
  enabled: boolean
  paused?: boolean
}

interface BackendResource {
  backendId: string
  type: string
  name: string
}

interface RuntimeCandidate {
  id: string
  value: unknown
}

const props = defineProps<{
  params: NodeParam[]
  mode: string
  preset: Preset | null
  backendId?: string
}>()

const { rowActionSize } = useUiPreferences()

const emit = defineEmits<{
  'estimate-change': [value: string | number]
}>()

const valueBuckets = reactive<Record<string, RuntimeCandidate[]>>({})
const fileBuckets = reactive<Record<string, RuntimeFile[]>>({})
const resources = ref<BackendResource[]>([])
const resourceLoading = ref(false)
const editorVisible = ref(false)
const editingParam = ref<NodeParam | null>(null)
const textDraft = ref('')
const modelDraft = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement>()
const fileInputAccept = ref('')
const filePickerTarget = ref<{ key: string; param: NodeParam } | null>(null)

const editingKey = computed(() => editingParam.value ? paramKey(editingParam.value) : '')
const editorCandidates = computed(() => editingParam.value ? candidatesFor(editingParam.value) : [])

watch(
  () => props.params,
  (params) => {
    for (const param of params) {
      const key = paramKey(param)
      if (isFileParam(param)) {
        fileBuckets[key] ||= []
      } else if (!valueBuckets[key]) {
        const defaultText = valueToText(param.defaultValue)
        valueBuckets[key] = defaultText ? [createCandidate(parseValue(defaultText, param.inferredType))] : []
      }
    }
    pruneRemovedParams(params)
    void fetchResources()
    emitEstimate()
  },
  { immediate: true }
)

watch([valueBuckets, fileBuckets, () => props.mode], emitEstimate, { deep: true })
watch(() => props.backendId, () => {
  void fetchResources()
})

function openEditor(param: NodeParam) {
  editingParam.value = param
  textDraft.value = ''
  modelDraft.value = []
  editorVisible.value = true
  if (isModelParam(param)) void fetchResources()
}

function addTextDraft() {
  const param = editingParam.value
  const text = textDraft.value.trim()
  if (!param || !text) return
  addCandidate(param, parseValue(text, param.inferredType))
  textDraft.value = ''
}

function addModelDraft() {
  const param = editingParam.value
  if (!param || !modelDraft.value.length) return
  for (const value of modelDraft.value) addCandidate(param, value)
  modelDraft.value = []
}

function addCandidate(param: NodeParam, value: unknown) {
  const key = paramKey(param)
  const bucket = valueBuckets[key] ?? (valueBuckets[key] = [])
  if (bucket.some(candidate => candidate.value === value)) return
  bucket.push(createCandidate(value))
}

function removeCandidate(param: NodeParam, id: string) {
  const key = paramKey(param)
  valueBuckets[key] = (valueBuckets[key] || []).filter(candidate => candidate.id !== id)
}

function clearParamValues(param: NodeParam) {
  const key = paramKey(param)
  if (isFileParam(param)) {
    for (const file of fileBuckets[key] || []) revokeFile(file)
    fileBuckets[key] = []
  } else {
    valueBuckets[key] = []
  }
}

function openFilePicker(param: NodeParam) {
  filePickerTarget.value = { key: paramKey(param), param }
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
  if (files.length) addFilesToBucket(files, { key: paramKey(param), param })
}

function addFilesToBucket(incoming: File[], target: { key: string; param: NodeParam }) {
  const files = incoming.filter(file => isAllowedFile(file, target.param))
  if (!files.length) {
    ElMessage.warning(`请选择${fileTypeLabel(target.param)}文件`)
    return
  }
  const bucket = fileBuckets[target.key] ?? (fileBuckets[target.key] = [])
  bucket.push(...files.map(createRuntimeFile))
}

async function collectParams() {
  const params: Record<string, unknown[]> = {}
  for (const param of props.params) {
    const key = paramKey(param)
    if (isFileParam(param)) {
      const files = activeFiles(key)
      if (!files.length) {
        ElMessage.warning(`请为 ${param.nodeType}.${param.inputName} 选择${fileTypeLabel(param)}文件`)
        return null
      }
      params[key] = await uploadRuntimeFiles(files)
    } else {
      const values = candidatesFor(param).map(candidate => candidate.value)
      if (!values.length) {
        ElMessage.warning(`请为 ${param.nodeType}.${param.inputName} 添加候选值`)
        return null
      }
      params[key] = values
    }
  }
  return params
}

function applyCopiedParams(inputParams: Record<string, unknown>) {
  let applied = 0
  let skippedFiles = 0

  for (const param of props.params) {
    const key = paramKey(param)
    if (!(key in inputParams)) continue

    if (isFileParam(param)) {
      skippedFiles++
      fileBuckets[key] = []
      continue
    }

    valueBuckets[key] = [createCandidate(inputParams[key])]
    applied++
  }

  emitEstimate()
  return { applied, skippedFiles }
}

function emitEstimate() {
  if (!props.params.length) {
    emit('estimate-change', 1)
    return
  }

  const counts = props.params.map(candidateCount)
  if (counts.some(count => count === 0)) {
    emit('estimate-change', '待填写')
    return
  }
  emit('estimate-change', props.mode === 'cartesian'
    ? counts.reduce((total, count) => total * count, 1)
    : Math.max(...counts))
}

async function fetchResources() {
  if (!props.params.some(isModelParam)) return
  resourceLoading.value = true
  try {
    const backends = await $fetch<Backend[]>('/api/v1/backends')
    const targetBackendId = props.backendId || props.preset?.backendId
    const targetBackends = targetBackendId
      ? backends.filter(backend => backend.id === targetBackendId)
      : backends.filter(backend => backend.type === 'comfyui' && backend.enabled)

    const rows = await Promise.all(targetBackends.map(async (backend) => {
      try {
        return await $fetch<BackendResource[]>(`/api/v1/backends/${backend.id}/resources`)
      } catch {
        return []
      }
    }))
    resources.value = rows.flat()
  } finally {
    resourceLoading.value = false
  }
}

function resourceOptionsFor(param: NodeParam) {
  const type = resourceTypeFor(param)
  const seen = new Set<string>()
  return resources.value.filter((resource) => {
    if (type && resource.type !== type) return false
    if (seen.has(resource.name)) return false
    seen.add(resource.name)
    return true
  })
}

function resourceTypeFor(param: NodeParam) {
  const key = `${param.nodeType}.${param.inputName}`
  if (key === 'LoraLoader.lora_name' || param.controlType === 'lora-select') return 'lora'
  if (param.nodeType === 'CheckpointLoaderSimple' || /ckpt|checkpoint/i.test(param.inputName)) return 'checkpoint'
  if (param.nodeType === 'VAELoader') return 'vae'
  if (param.nodeType === 'UNETLoader') return 'unet'
  return ''
}

function candidatesFor(param: NodeParam) {
  return isFileParam(param)
    ? activeFiles(paramKey(param)).map(file => ({ id: file.id, value: file }))
    : valueBuckets[paramKey(param)] || []
}

function candidatePreview(param: NodeParam) {
  return candidatesFor(param).slice(0, 4)
}

function candidateCount(param: NodeParam) {
  return candidatesFor(param).length
}

function candidateLabel(candidate: RuntimeCandidate, param: NodeParam) {
  if (isFileParam(param) && isRuntimeFile(candidate.value)) return candidate.value.name
  const text = valueToText(candidate.value)
  return text.length > 34 ? `${text.slice(0, 34)}...` : text
}

function isModelParam(param: NodeParam) {
  return param.inferredType === 'MODEL' || param.controlType === 'lora-select' || param.controlType === 'select' && Boolean(resourceTypeFor(param))
}

function isFileParam(param: NodeParam) {
  return param.inferredType === 'IMAGE' || param.inferredType === 'FILE' || param.controlType === 'file-upload'
}

function activeFiles(key: string) {
  return (fileBuckets[key] || []).filter(file => !file.deleted)
}

function createCandidate(value: unknown): RuntimeCandidate {
  return { id: createRuntimeId(), value }
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
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

async function uploadRuntimeFiles(files: RuntimeFile[]) {
  const formData = new FormData()
  for (const file of files) formData.append('files', file.file, file.name)
  return await $fetch<RuntimeAsset[]>('/api/v1/runtime-assets', {
    method: 'POST',
    body: formData
  })
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

function uploadTitle(param: NodeParam) {
  return `上传${fileTypeLabel(param) || '运行'}文件`
}

function uploadHint(param: NodeParam) {
  const label = fileTypeLabel(param) || '任意'
  return `点击或拖拽${label}文件到这里，可以一次选择多个。`
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
    file: '文件',
    lora: 'Lora'
  }
  const name = param.inputName.toLowerCase()
  const matched = Object.entries(labels).find(([key]) => name.includes(key))
  return matched?.[1] || param.inputName
}

function editorHelp(param: NodeParam) {
  if (isFileParam(param)) return '选择一个或多个文件作为候选值。'
  if (isModelParam(param)) return '从已同步的后端资源中多选，添加后会成为候选值。'
  return '输入一个值后点击添加；每个候选值会独立参与组合。'
}

function singleValuePlaceholder(param: NodeParam) {
  if (param.inferredType === 'SEED') return '输入随机种子，-1 表示随机'
  if (param.inferredType === 'BOOLEAN') return 'true / false'
  return valueToText(param.defaultValue) || '输入一个候选值'
}

function parseValue(value: string, inferredType: string) {
  if (inferredType === 'INT' || inferredType === 'SEED') return Number.parseInt(value, 10)
  if (inferredType === 'FLOAT') return Number.parseFloat(value)
  if (inferredType === 'BOOLEAN') return value === 'true' || value === '1' || value === '是'
  if (inferredType === 'JSON') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function valueToText(value: unknown) {
  if (value === undefined || value === null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function paramKey(param: NodeParam) {
  return `${param.nodeId}.${param.inputName}`
}

function pruneRemovedParams(params: NodeParam[]) {
  const keys = new Set(params.map(paramKey))
  for (const key of Object.keys(valueBuckets)) if (!keys.has(key)) Reflect.deleteProperty(valueBuckets, key)
  for (const key of Object.keys(fileBuckets)) {
    if (!keys.has(key)) {
      for (const file of fileBuckets[key] || []) revokeFile(file)
      Reflect.deleteProperty(fileBuckets, key)
    }
  }
}

function revokeFile(file: RuntimeFile) {
  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
}

function isRuntimeFile(value: unknown): value is RuntimeFile {
  return typeof value === 'object' && value !== null && 'file' in value && 'name' in value
}

onBeforeUnmount(() => {
  for (const bucket of Object.values(fileBuckets)) {
    for (const file of bucket) revokeFile(file)
  }
})

defineExpose({ collectParams, applyCopiedParams })
</script>

<style scoped>
.fm-runtime-panel,
.fm-value-editor {
  display: grid;
  gap: 16px;
}

.fm-panel-heading,
.fm-runtime-row,
.fm-runtime-param,
.fm-runtime-actions,
.fm-editor-head,
.fm-editor-adder,
.fm-candidate-head,
.fm-candidate-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.fm-panel-heading,
.fm-editor-head,
.fm-candidate-head,
.fm-candidate-row {
  justify-content: space-between;
}

.fm-panel-heading span {
  color: var(--fm-text);
  font-size: 16px;
  font-weight: 700;
}

.fm-panel-heading small,
.fm-runtime-param span,
.fm-runtime-empty,
.fm-more-count,
.fm-editor-head span,
.fm-candidate-head span,
.fm-option-meta {
  color: var(--fm-muted);
  font-size: 12px;
}

.fm-runtime-table,
.fm-candidate-list,
.fm-candidate-items {
  display: grid;
  gap: 8px;
}

.fm-runtime-row {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1fr) auto;
  padding: 10px 12px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 64%, transparent);
}

.fm-runtime-param {
  justify-content: space-between;
}

.fm-runtime-param div,
.fm-editor-head div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.fm-runtime-param strong,
.fm-editor-head strong {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-runtime-values {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.fm-runtime-actions {
  justify-content: flex-end;
}

.fm-editor-adder {
  align-items: flex-start;
}

.fm-editor-adder .el-button {
  flex: 0 0 auto;
}

.fm-upload-panel {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 96px;
  padding: 16px;
  border: 1px dashed var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 76%, transparent);
  color: var(--fm-muted);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.fm-upload-panel:hover,
.fm-upload-panel:focus-visible {
  border-color: var(--fm-accent);
  background: color-mix(in srgb, var(--fm-accent) 12%, var(--fm-panel-muted));
  outline: none;
}

.fm-upload-panel.filled {
  border-style: solid;
  border-color: color-mix(in srgb, var(--fm-accent) 42%, var(--fm-border));
}

.fm-upload-mark {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid var(--fm-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--fm-accent) 12%, transparent);
  color: var(--fm-text);
  font-size: 12px;
  font-weight: 700;
}

.fm-upload-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.fm-upload-main strong,
.fm-upload-count strong,
.fm-candidate-head strong {
  color: var(--fm-text);
}

.fm-upload-main span {
  color: var(--fm-muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.fm-upload-count {
  display: grid;
  gap: 2px;
  min-width: 72px;
  color: var(--fm-muted);
  text-align: right;
}

.fm-upload-count strong {
  font-size: 24px;
  line-height: 1;
}

.fm-candidate-list {
  padding: 12px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 58%, transparent);
}

.fm-candidate-items {
  max-height: min(320px, 42vh);
  overflow: auto;
}

.fm-candidate-row {
  padding: 8px 10px;
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel) 58%, transparent);
}

.fm-candidate-row span {
  min-width: 0;
  overflow: hidden;
  color: var(--fm-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-hidden-input {
  display: none;
}

@media (max-width: 900px) {
  .fm-runtime-row,
  .fm-upload-panel,
  .fm-editor-adder {
    grid-template-columns: 1fr;
  }

  .fm-runtime-row {
    display: grid;
  }

  .fm-runtime-actions,
  .fm-upload-count {
    justify-content: flex-start;
    text-align: left;
  }
}
</style>
