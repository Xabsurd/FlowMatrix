<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('presetsPage.title') }}</h1>
        <p class="fm-page-subtitle">{{ t('presetsPage.subtitle') }}</p>
      </div>
      <ElButton type="primary" @click="openCreateDialog">{{ t('presetsPage.create') }}</ElButton>
    </div>

    <div v-if="presets.length" class="fm-card-grid">
      <article v-for="preset in presets" :key="preset.id" class="fm-card">
        <div class="fm-card-header">
          <div>
            <h3>{{ preset.name }}</h3>
            <p>{{ preset.description || t('presetsPage.noDescription') }}</p>
          </div>
          <div class="fm-card-actions">
            <ElTag size="small">{{ preset.scheduleMode }}</ElTag>
            <ElButton text :size="rowActionSize" @click="openEditDialog(preset)">{{ t('workflows.edit') }}</ElButton>
            <ElButton text :size="rowActionSize" type="danger" @click="removePreset(preset)">{{ t('common.delete') }}</ElButton>
          </div>
        </div>
        <div class="fm-card-body">
          <div class="fm-meta-row">
            <span class="fm-label">{{ t('run.runtimeInputs') }}</span>
            <span class="fm-value">{{ preset.nodeParams.filter(param => param.runtimeInput).length }}</span>
          </div>
          <div class="fm-meta-row">
            <span class="fm-label">{{ t('run.fixedParams') }}</span>
            <span class="fm-value">{{ preset.nodeParams.filter(param => !param.runtimeInput).length }}</span>
          </div>
          <div class="fm-meta-row">
            <span class="fm-label">{{ t('presetsPage.outputNodes') }}</span>
            <span class="fm-value">{{ enabledOutputCount(preset) }}</span>
          </div>
          <div class="fm-node-list">
            <ElTag
              v-for="param in preset.nodeParams.slice(0, 8)"
              :key="`${preset.id}-${param.nodeId}-${param.inputName}`"
              size="small"
              :type="param.runtimeInput ? 'primary' : 'info'"
              effect="plain"
            >
              {{ param.nodeType }}.{{ param.inputName }}
            </ElTag>
          </div>
        </div>
      </article>
    </div>

    <ElEmpty v-else-if="!loading" :description="t('presetsPage.empty')" />

    <ElDialog v-model="showCreateDialog" :title="editingId ? t('presetsPage.editDialog') : t('presetsPage.createDialog')" width="860px">
      <ElForm label-position="top">
        <ElFormItem :label="t('presetsPage.name')" required>
          <ElInput v-model="form.name" :placeholder="t('presetsPage.namePlaceholder')" />
        </ElFormItem>
        <ElFormItem :label="t('presetsPage.workflow')" required>
          <ElSelect v-model="form.workflowId" :placeholder="t('presetsPage.workflowPlaceholder')" filterable style="width: 100%" :disabled="Boolean(editingId)">
            <ElOption
              v-for="workflow in workflows"
              :key="workflow.id"
              :label="`${workflow.name} · ${t('presetsPage.workflowOptionNodes', { count: workflow.parsedNodes?.length || 0 })}`"
              :value="workflow.id"
            />
          </ElSelect>
        </ElFormItem>
        <div class="fm-form-grid">
          <ElFormItem :label="t('presetsPage.scheduleMode')">
            <ElSelect v-model="form.scheduleMode" style="width: 100%">
              <ElOption :label="t('run.scheduleIdleFirst')" value="idle-first" />
              <ElOption :label="t('run.scheduleLeastQueue')" value="least-queue" />
              <ElOption :label="t('run.scheduleResourceMatch')" value="resource-match" />
              <ElOption :label="t('run.scheduleSmart')" value="smart" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="t('presetsPage.description')">
            <ElInput v-model="form.description" :placeholder="t('presetsPage.descriptionPlaceholder')" />
          </ElFormItem>
        </div>

        <div class="fm-builder">
          <div class="fm-builder-toolbar">
            <ElSelect v-model="draft.nodeKey" :placeholder="t('presetsPage.selectNode')" filterable>
              <ElOption
                v-for="node in selectableNodes"
                :key="node.nodeId"
                :label="`${node.nodeId} · ${node.nodeType}${node.title ? ` · ${node.title}` : ''}`"
                :value="node.nodeId"
              />
            </ElSelect>
            <ElSelect v-model="draft.inputName" :placeholder="t('presetsPage.selectParam')" filterable :disabled="!draft.nodeKey">
              <ElOption
                v-for="input in selectableInputs"
                :key="input.name"
                :label="`${input.name} · ${input.spec.type}`"
                :value="input.name"
              />
            </ElSelect>
            <ElSwitch
              v-model="draft.runtimeInput"
              inline-prompt
              :active-text="t('presetsPage.runtime')"
              :inactive-text="t('presetsPage.fixed')"
            />
            <ElButton type="primary" @click="addParam">{{ t('presetsPage.addParam') }}</ElButton>
          </div>

          <div v-if="configuredParams.length" class="fm-param-list">
            <div v-for="(param, index) in configuredParams" :key="param.key" class="fm-param-row">
              <div class="fm-param-main">
                <strong>{{ param.nodeType }}.{{ param.inputName }}</strong>
                <small>{{ param.nodeId }} · {{ param.controlType }} · {{ param.runtimeInput ? t('presetsPage.runtimeVisible') : t('presetsPage.fixedWritten') }}</small>
              </div>
              <ElSwitch
                v-model="param.runtimeInput"
                inline-prompt
                :active-text="t('presetsPage.runtime')"
                :inactive-text="t('presetsPage.fixed')"
              />
              <ElSelect
                v-if="isManualNumericParam(param)"
                v-model="param.inferredType"
                class="fm-type-select"
                :placeholder="t('presetsPage.valueType')"
              >
                <ElOption :label="t('presetsPage.integer')" value="INT" />
                <ElOption :label="t('presetsPage.float')" value="FLOAT" />
              </ElSelect>
              <span v-else class="fm-type-static">{{ typeLabel(param.inferredType) }}</span>
              <ElInput
                v-model="param.defaultText"
                :disabled="param.runtimeInput"
                :placeholder="t('presetsPage.fixedValue')"
                class="fm-fixed-input"
              />
              <ElButton text :size="rowActionSize" type="danger" @click="configuredParams.splice(index, 1)">{{ t('presetsPage.remove') }}</ElButton>
            </div>
          </div>
          <ElEmpty v-else :description="t('presetsPage.addHint')" />
        </div>

        <div class="fm-output-builder">
          <div class="fm-section-heading">
            <strong>{{ t('presetsPage.outputNodes') }}</strong>
            <span>{{ t('presetsPage.outputHint') }}</span>
          </div>
          <div v-if="outputNodeOptions.length" class="fm-output-list">
            <label
              v-for="node in outputNodeOptions"
              :key="node.nodeId"
              class="fm-output-row"
            >
              <ElCheckbox v-model="outputNodeDraft[node.nodeId]" />
              <div>
                <strong>{{ node.nodeType }}</strong>
                <small>{{ node.nodeId }}{{ node.title ? ` · ${node.title}` : '' }}</small>
              </div>
            </label>
          </div>
          <ElEmpty v-else :description="t('presetsPage.noOutputNodes')" />
        </div>
      </ElForm>
      <template #footer>
        <ElButton @click="showCreateDialog = false">{{ t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" @click="savePreset">{{ editingId ? t('presetsPage.saveChanges') : t('presetsPage.savePreset') }}</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const { rowActionSize } = useUiPreferences()

interface ParsedNodeInput {
  type: string
  options?: unknown[]
  default?: unknown
}

interface ParsedNode {
  nodeId: string
  nodeType: string
  title?: string
  inputs: Record<string, ParsedNodeInput>
}

interface OutputNode {
  nodeId: string
  nodeType: string
  title?: string
  enabled: boolean
}

interface Workflow {
  id: string
  name: string
  parsedNodes: ParsedNode[] | null
}

interface NodeParam {
  nodeId: string
  nodeType: string
  inputName: string
  inferredType: string
  controlType: string
  runtimeInput?: boolean
  defaultValue?: unknown
  options?: unknown[]
}

interface ConfiguredParam extends NodeParam {
  key: string
  defaultText: string
  runtimeInput: boolean
}

interface Preset {
  id: string
  workflowId: string
  name: string
  description: string | null
  scheduleMode: string
  nodeParams: NodeParam[]
  outputNodes?: OutputNode[]
}

const workflows = ref<Workflow[]>([])
const presets = ref<Preset[]>([])
const configuredParams = ref<ConfiguredParam[]>([])
const outputNodeDraft = reactive<Record<string, boolean>>({})
const loading = ref(false)
const saving = ref(false)
const showCreateDialog = ref(false)
const editingId = ref('')
const hydratingForm = ref(false)
const form = reactive({
  name: '',
  workflowId: '',
  scheduleMode: 'idle-first',
  description: ''
})
const draft = reactive({
  nodeKey: '',
  inputName: '',
  runtimeInput: true
})

const selectedWorkflow = computed(() => workflows.value.find(workflow => workflow.id === form.workflowId))
const selectableNodes = computed(() => selectedWorkflow.value?.parsedNodes || [])
const selectedNode = computed(() => selectableNodes.value.find(node => node.nodeId === draft.nodeKey))
const selectableInputs = computed(() => Object.entries(selectedNode.value?.inputs || {})
  .filter(([name, spec]) => spec.type !== 'link' || isPrimitiveValueInput(selectedNode.value, name))
  .map(([name, spec]) => ({ name, spec })))
const outputNodeOptions = computed(() => (selectedWorkflow.value?.parsedNodes || [])
  .filter(node => isOutputNode(node))
  .map(node => ({
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    title: node.title,
    enabled: outputNodeDraft[node.nodeId] ?? true
  })))

watch(() => form.workflowId, () => {
  if (hydratingForm.value) return
  configuredParams.value = []
  syncOutputNodeDraft()
  draft.nodeKey = ''
  draft.inputName = ''
})

watch(() => draft.nodeKey, () => {
  draft.inputName = ''
})

async function fetchData() {
  loading.value = true
  try {
    const [workflowRows, presetRows] = await Promise.all([
      $fetch<Workflow[]>('/api/v1/workflows'),
      $fetch<Preset[]>('/api/v1/presets')
    ])
    workflows.value = workflowRows
    presets.value = presetRows
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  if (!workflows.value.length) {
    ElMessage.warning(t('presetsPage.uploadWorkflowFirst'))
    return
  }
  editingId.value = ''
  form.name = ''
  form.workflowId = workflows.value[0]?.id || ''
  form.scheduleMode = 'idle-first'
  form.description = ''
  configuredParams.value = []
  syncOutputNodeDraft()
  draft.nodeKey = ''
  draft.inputName = ''
  draft.runtimeInput = true
  showCreateDialog.value = true
}

function openEditDialog(preset: Preset) {
  hydratingForm.value = true
  editingId.value = preset.id
  form.name = preset.name
  form.workflowId = preset.workflowId
  form.scheduleMode = preset.scheduleMode
  form.description = preset.description || ''
  configuredParams.value = preset.nodeParams.map(param => ({
    ...param,
    key: `${param.nodeId}.${param.inputName}`,
    runtimeInput: Boolean(param.runtimeInput),
    defaultText: valueToText(param.defaultValue)
  }))
  syncOutputNodeDraft(preset.outputNodes)
  draft.nodeKey = ''
  draft.inputName = ''
  draft.runtimeInput = true
  showCreateDialog.value = true
  nextTick(() => {
    hydratingForm.value = false
  })
}

function addParam() {
  const node = selectedNode.value
  const input = node?.inputs[draft.inputName]
  if (!node || !input) {
    ElMessage.warning(t('presetsPage.selectNodeParam'))
    return
  }

  const key = `${node.nodeId}.${draft.inputName}`
  if (configuredParams.value.some(param => param.key === key)) {
    ElMessage.warning(t('presetsPage.paramExists'))
    return
  }

  const inferred = inferParam(node.nodeType, draft.inputName, input)
  configuredParams.value.push({
    key,
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    inputName: draft.inputName,
    defaultValue: input.default,
    defaultText: valueToText(input.default),
    runtimeInput: draft.runtimeInput,
    ...inferred
  })
}

async function savePreset() {
  for (const param of configuredParams.value) {
    const fixedValue = param.defaultText.trim()
    if (!param.runtimeInput && fixedValue && !isValidValueText(fixedValue, param.inferredType)) {
      ElMessage.warning(t('presetsPage.invalidFixedValue', {
        name: param.nodeType + '.' + param.inputName,
        type: typeLabel(param.inferredType)
      }))
      return
    }
  }

  const nodeParams = configuredParams.value.map(({ key: _key, defaultText, ...param }) => ({
    ...param,
    defaultValue: parseValue(defaultText, param.inferredType)
  }))
  const outputNodes = outputNodeOptions.value.map(node => ({
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    title: node.title,
    enabled: Boolean(outputNodeDraft[node.nodeId])
  }))

  if (!form.name.trim() || !form.workflowId) {
    ElMessage.warning(t('presetsPage.fillNameWorkflow'))
    return
  }
  if (!nodeParams.length) {
    ElMessage.warning(t('presetsPage.addOneParam'))
    return
  }

  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      scheduleMode: form.scheduleMode,
      nodeParams,
      outputNodes
    }
    await $fetch(editingId.value ? `/api/v1/presets/${editingId.value}` : '/api/v1/presets', {
      method: editingId.value ? 'PATCH' : 'POST',
      body: editingId.value ? body : {
        ...body,
        workflowId: form.workflowId
      }
    })
    showCreateDialog.value = false
    await fetchData()
    ElMessage.success(editingId.value ? t('presetsPage.updated') : t('presetsPage.saved'))
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('presetsPage.saveFailed'))
  } finally {
    saving.value = false
  }
}

function enabledOutputCount(preset: Preset) {
  if (!preset.outputNodes?.length) return t('presetsPage.all')
  return preset.outputNodes.filter(node => node.enabled).length
}

function syncOutputNodeDraft(nodes?: OutputNode[]) {
  for (const key of Object.keys(outputNodeDraft)) {
    Reflect.deleteProperty(outputNodeDraft, key)
  }

  const saved = new Map((nodes || []).map(node => [node.nodeId, node.enabled]))
  for (const node of outputNodeOptions.value) {
    outputNodeDraft[node.nodeId] = saved.get(node.nodeId) ?? true
  }
}

function isOutputNode(node: ParsedNode) {
  return /save|preview|output/i.test(node.nodeType)
}

async function removePreset(preset: Preset) {
  try {
    await ElMessageBox.confirm(t('presetsPage.deleteConfirm', { name: preset.name }), t('presetsPage.deleteTitle'), { type: 'warning' })
    await $fetch(`/api/v1/presets/${preset.id}`, { method: 'DELETE' })
    await fetchData()
    ElMessage.success(t('presetsPage.deleted'))
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : t('presetsPage.deleteFailed'))
  }
}

function inferParam(nodeType: string, inputName: string, input: ParsedNodeInput) {
  const known = knownParams[`${nodeType}.${inputName}`]
  if (known) return known
  const modelResourceType = resourceTypeForParam(nodeType, inputName)
  if (modelResourceType) {
    return {
      inferredType: 'MODEL',
      controlType: modelResourceType === 'lora' ? 'lora-select' : 'select'
    }
  }
  if (isPrimitiveValueInput({ nodeType } as ParsedNode, inputName)) return inferPrimitiveParam(nodeType)
  if (input.type === 'INT') return { inferredType: 'INT', controlType: 'number' }
  if (input.type === 'FLOAT') return { inferredType: 'FLOAT', controlType: 'number' }
  if (input.type === 'BOOLEAN') return { inferredType: 'BOOLEAN', controlType: 'switch' }
  if (Array.isArray(input.options)) return { inferredType: 'ENUM', controlType: 'select', options: input.options }
  if (inputName.toLowerCase().includes('seed')) return { inferredType: 'SEED', controlType: 'seed-input' }
  if (isImageInput(inputName)) return { inferredType: 'IMAGE', controlType: 'file-upload' }
  if (isFileInput(inputName)) return { inferredType: 'FILE', controlType: 'file-upload' }
  return { inferredType: 'STRING', controlType: inputName.toLowerCase().includes('text') ? 'textarea' : 'text' }
}

function isPrimitiveValueInput(node: ParsedNode | undefined, inputName: string) {
  return inputName === 'value' && Boolean(node?.nodeType.match(/^Primitive/i))
}

function inferPrimitiveParam(nodeType: string) {
  if (/Primitive(Boolean|Bool)/i.test(nodeType)) return { inferredType: 'BOOLEAN', controlType: 'switch' }
  if (/Primitive(Float|Number)/i.test(nodeType)) return { inferredType: 'FLOAT', controlType: 'number' }
  if (/Primitive(Int|Integer)/i.test(nodeType)) return { inferredType: 'INT', controlType: 'number' }
  return { inferredType: 'STRING', controlType: 'textarea' }
}

function isImageInput(inputName: string) {
  const name = inputName.toLowerCase()
  return name.includes('image') || name.includes('mask') || name.includes('photo') || name.includes('picture')
}

function isFileInput(inputName: string) {
  const name = inputName.toLowerCase()
  return name.includes('file') || name.includes('video') || name.includes('audio')
}

function resourceTypeForParam(nodeType: string, inputName: string) {
  const lowerNodeType = nodeType.toLowerCase()
  const lowerInputName = inputName.toLowerCase()
  if (lowerInputName === 'lora_name') return 'lora'
  if (/^(ckpt|checkpoint)_?name$/.test(lowerInputName) || /checkpointloader/.test(lowerNodeType)) return 'checkpoint'
  if (lowerInputName === 'vae_name' || lowerNodeType.includes('vaeloader')) return 'vae'
  if (lowerInputName === 'unet_name' || lowerInputName === 'diffusion_model_name' || lowerNodeType.includes('unetloader')) return 'unet'
  if (/^control_?net_?name$/.test(lowerInputName) || lowerNodeType.includes('controlnetloader')) return 'controlnet'
  if (/^upscale(r)?_?name$/.test(lowerInputName) || lowerNodeType.includes('upscalemodelloader')) return 'upscale'
  if (lowerInputName === 'embedding_name') return 'embedding'
  return ''
}

function valueToText(value: unknown) {
  if (value === undefined || value === null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function parseValue(value: string, inferredType: string) {
  if (inferredType === 'INT' || inferredType === 'SEED') return Number.parseInt(value || '0', 10)
  if (inferredType === 'FLOAT') return Number.parseFloat(value || '0')
  if (inferredType === 'BOOLEAN') return value === 'true' || value === '1'
  if (inferredType === 'JSON') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}

function isManualNumericParam(param: Pick<NodeParam, 'inferredType' | 'controlType'>) {
  return (param.inferredType === 'INT' || param.inferredType === 'FLOAT')
    && (param.controlType === 'number' || param.controlType === 'slider')
}

function isValidValueText(value: string, inferredType: string) {
  if (inferredType === 'INT' || inferredType === 'SEED') return /^[-+]?\d+$/.test(value)
  if (inferredType === 'FLOAT') return Number.isFinite(Number(value))
  return true
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    STRING: t('presetsPage.text'),
    INT: t('presetsPage.integer'),
    FLOAT: t('presetsPage.float'),
    BOOLEAN: t('presetsPage.boolean'),
    ENUM: t('presetsPage.enum'),
    MODEL: t('presetsPage.model'),
    SEED: t('presetsPage.seed'),
    JSON: 'JSON',
    IMAGE: t('presetsPage.image'),
    FILE: t('presetsPage.file')
  }
  return labels[type] || type
}

const knownParams: Record<string, { inferredType: string; controlType: string; options?: unknown[] }> = {
  'CLIPTextEncode.text': { inferredType: 'STRING', controlType: 'textarea' },
  'KSampler.seed': { inferredType: 'SEED', controlType: 'seed-input' },
  'KSampler.steps': { inferredType: 'INT', controlType: 'slider' },
  'KSampler.cfg': { inferredType: 'FLOAT', controlType: 'slider' },
  'KSampler.sampler_name': { inferredType: 'ENUM', controlType: 'select' },
  'KSampler.scheduler': { inferredType: 'ENUM', controlType: 'select' },
  'EmptyLatentImage.width': { inferredType: 'INT', controlType: 'number' },
  'EmptyLatentImage.height': { inferredType: 'INT', controlType: 'number' },
  'LoraLoader.lora_name': { inferredType: 'MODEL', controlType: 'lora-select' },
  'LoraLoader.strength_model': { inferredType: 'FLOAT', controlType: 'slider' },
  'LoraLoader.strength_clip': { inferredType: 'FLOAT', controlType: 'slider' },
  'LoraLoaderModelOnly.strength_model': { inferredType: 'FLOAT', controlType: 'slider' },
  'CheckpointLoaderSimple.ckpt_name': { inferredType: 'MODEL', controlType: 'select' },
  'VAELoader.vae_name': { inferredType: 'MODEL', controlType: 'select' },
  'UNETLoader.unet_name': { inferredType: 'MODEL', controlType: 'select' }
}

onMounted(fetchData)
</script>

<style scoped>
.fm-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.fm-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.fm-card-header h3 { margin: 0; font-size: 16px; }
.fm-card-header p { margin: 6px 0 0; color: var(--fm-muted); font-size: 13px; }
.fm-card-body { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
.fm-meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.fm-label { color: var(--fm-muted); }
.fm-value { color: var(--fm-text); }
.fm-node-list { display: flex; flex-wrap: wrap; gap: 6px; }
.fm-form-grid { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 12px; }
.fm-builder { display: flex; flex-direction: column; gap: 12px; }
.fm-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.fm-section-heading strong { color: var(--fm-text); font-size: 14px; }
.fm-section-heading span { color: var(--fm-muted); font-size: 12px; }
.fm-builder-toolbar { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto auto; align-items: center; gap: 10px; }
.fm-param-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow: auto; }
.fm-param-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(104px, 132px) minmax(180px, 240px) auto; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent); }
.fm-param-main { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.fm-param-main strong { color: var(--fm-text); font-size: 13px; }
.fm-param-main small { color: var(--fm-muted); overflow-wrap: anywhere; }
.fm-type-select { min-width: 0; }
.fm-type-static { min-width: 72px; color: var(--fm-muted); font-size: 12px; text-align: center; }
.fm-fixed-input { min-width: 0; }
.fm-output-builder { display: grid; gap: 12px; margin-top: 16px; }
.fm-output-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.fm-output-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent); cursor: pointer; }
.fm-output-row div { display: grid; gap: 3px; min-width: 0; }
.fm-output-row strong { overflow: hidden; color: var(--fm-text); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.fm-output-row small { color: var(--fm-muted); overflow-wrap: anywhere; }
@media (max-width: 860px) {
  .fm-form-grid,
  .fm-builder-toolbar,
  .fm-param-row { grid-template-columns: 1fr; }
}
</style>
