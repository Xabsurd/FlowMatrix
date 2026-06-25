<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">调用配置</h1>
        <p class="fm-page-subtitle">按节点添加参数，决定哪些在运行时填写，哪些作为固定值写入工作流。</p>
      </div>
      <ElButton type="primary" @click="openCreateDialog">新建配置</ElButton>
    </div>

    <div v-if="presets.length" class="fm-card-grid">
      <article v-for="preset in presets" :key="preset.id" class="fm-card">
        <div class="fm-card-header">
          <div>
            <h3>{{ preset.name }}</h3>
            <p>{{ preset.description || '未填写描述' }}</p>
          </div>
          <div class="fm-card-actions">
            <ElTag size="small">{{ preset.scheduleMode }}</ElTag>
            <ElButton text @click="openEditDialog(preset)">编辑</ElButton>
            <ElButton text type="danger" @click="removePreset(preset)">删除</ElButton>
          </div>
        </div>
        <div class="fm-card-body">
          <div class="fm-meta-row">
            <span class="fm-label">运行输入</span>
            <span class="fm-value">{{ preset.nodeParams.filter(param => param.runtimeInput).length }}</span>
          </div>
          <div class="fm-meta-row">
            <span class="fm-label">固定参数</span>
            <span class="fm-value">{{ preset.nodeParams.filter(param => !param.runtimeInput).length }}</span>
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

    <ElEmpty v-else-if="!loading" description="暂无调用配置，点击「新建配置」从工作流生成。" />

    <ElDialog v-model="showCreateDialog" :title="editingId ? '编辑调用配置' : '新建调用配置'" width="860px">
      <ElForm label-position="top">
        <ElFormItem label="配置名称" required>
          <ElInput v-model="form.name" placeholder="例如：文生图基础配置" />
        </ElFormItem>
        <ElFormItem label="工作流" required>
          <ElSelect v-model="form.workflowId" placeholder="请选择已上传工作流" filterable style="width: 100%" :disabled="Boolean(editingId)">
            <ElOption
              v-for="workflow in workflows"
              :key="workflow.id"
              :label="`${workflow.name} · ${workflow.parsedNodes?.length || 0} 个节点`"
              :value="workflow.id"
            />
          </ElSelect>
        </ElFormItem>
        <div class="fm-form-grid">
          <ElFormItem label="调度模式">
            <ElSelect v-model="form.scheduleMode" style="width: 100%">
              <ElOption label="空闲优先" value="idle-first" />
              <ElOption label="最少队列" value="least-queue" />
              <ElOption label="资源匹配" value="resource-match" />
              <ElOption label="智能调度" value="smart" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="描述">
            <ElInput v-model="form.description" placeholder="用途、适用模型或参数说明" />
          </ElFormItem>
        </div>

        <div class="fm-builder">
          <div class="fm-builder-toolbar">
            <ElSelect v-model="draft.nodeKey" placeholder="选择节点" filterable>
              <ElOption
                v-for="node in selectableNodes"
                :key="node.nodeId"
                :label="`${node.nodeId} · ${node.nodeType}${node.title ? ` · ${node.title}` : ''}`"
                :value="node.nodeId"
              />
            </ElSelect>
            <ElSelect v-model="draft.inputName" placeholder="选择参数" filterable :disabled="!draft.nodeKey">
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
              active-text="运行"
              inactive-text="固定"
            />
            <ElButton type="primary" @click="addParam">添加参数</ElButton>
          </div>

          <div v-if="configuredParams.length" class="fm-param-list">
            <div v-for="(param, index) in configuredParams" :key="param.key" class="fm-param-row">
              <div class="fm-param-main">
                <strong>{{ param.nodeType }}.{{ param.inputName }}</strong>
                <small>{{ param.nodeId }} · {{ param.controlType }} · {{ param.runtimeInput ? '运行界面显示' : '固定值写入工作流' }}</small>
              </div>
              <ElSwitch
                v-model="param.runtimeInput"
                inline-prompt
                active-text="运行"
                inactive-text="固定"
              />
              <ElInput
                v-model="param.defaultText"
                :disabled="param.runtimeInput"
                placeholder="固定值"
                class="fm-fixed-input"
              />
              <ElButton text type="danger" @click="configuredParams.splice(index, 1)">移除</ElButton>
            </div>
          </div>
          <ElEmpty v-else description="请从上方选择节点和参数后添加。" />
        </div>
      </ElForm>
      <template #footer>
        <ElButton @click="showCreateDialog = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="savePreset">{{ editingId ? '保存修改' : '保存配置' }}</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

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
}

const workflows = ref<Workflow[]>([])
const presets = ref<Preset[]>([])
const configuredParams = ref<ConfiguredParam[]>([])
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
  .filter(([, spec]) => spec.type !== 'link')
  .map(([name, spec]) => ({ name, spec })))

watch(() => form.workflowId, () => {
  if (hydratingForm.value) return
  configuredParams.value = []
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
    ElMessage.warning('请先上传工作流')
    return
  }
  editingId.value = ''
  form.name = ''
  form.workflowId = workflows.value[0]?.id || ''
  form.scheduleMode = 'idle-first'
  form.description = ''
  configuredParams.value = []
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
    ElMessage.warning('请选择节点和参数')
    return
  }

  const key = `${node.nodeId}.${draft.inputName}`
  if (configuredParams.value.some(param => param.key === key)) {
    ElMessage.warning('该参数已添加')
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
  const nodeParams = configuredParams.value.map(({ key: _key, defaultText, ...param }) => ({
    ...param,
    defaultValue: parseValue(defaultText, param.inferredType)
  }))

  if (!form.name.trim() || !form.workflowId) {
    ElMessage.warning('请填写名称并选择工作流')
    return
  }
  if (!nodeParams.length) {
    ElMessage.warning('请至少添加一个节点参数')
    return
  }

  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      scheduleMode: form.scheduleMode,
      nodeParams
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
    ElMessage.success(editingId.value ? '调用配置已更新' : '调用配置已保存')
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function removePreset(preset: Preset) {
  try {
    await ElMessageBox.confirm(`确定删除「${preset.name}」？已创建的历史运行记录不会被删除。`, '删除调用配置', { type: 'warning' })
    await $fetch(`/api/v1/presets/${preset.id}`, { method: 'DELETE' })
    await fetchData()
    ElMessage.success('调用配置已删除')
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

function inferParam(nodeType: string, inputName: string, input: ParsedNodeInput) {
  const known = knownParams[`${nodeType}.${inputName}`]
  if (known) return known
  if (input.type === 'INT') return { inferredType: 'INT', controlType: 'number' }
  if (input.type === 'FLOAT') return { inferredType: 'FLOAT', controlType: 'number' }
  if (input.type === 'BOOLEAN') return { inferredType: 'BOOLEAN', controlType: 'switch' }
  if (Array.isArray(input.options)) return { inferredType: 'ENUM', controlType: 'select', options: input.options }
  if (inputName.toLowerCase().includes('seed')) return { inferredType: 'SEED', controlType: 'seed-input' }
  if (isImageInput(inputName)) return { inferredType: 'IMAGE', controlType: 'file-upload' }
  if (isFileInput(inputName)) return { inferredType: 'FILE', controlType: 'file-upload' }
  return { inferredType: 'STRING', controlType: inputName.toLowerCase().includes('text') ? 'textarea' : 'text' }
}

function isImageInput(inputName: string) {
  const name = inputName.toLowerCase()
  return name.includes('image') || name.includes('mask') || name.includes('photo') || name.includes('picture')
}

function isFileInput(inputName: string) {
  const name = inputName.toLowerCase()
  return name.includes('file') || name.includes('video') || name.includes('audio')
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
  'CheckpointLoaderSimple.ckpt_name': { inferredType: 'MODEL', controlType: 'select' }
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
.fm-builder-toolbar { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto auto; align-items: center; gap: 10px; }
.fm-param-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow: auto; }
.fm-param-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(180px, 240px) auto; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent); }
.fm-param-main { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.fm-param-main strong { color: var(--fm-text); font-size: 13px; }
.fm-param-main small { color: var(--fm-muted); overflow-wrap: anywhere; }
.fm-fixed-input { min-width: 0; }
@media (max-width: 860px) {
  .fm-form-grid,
  .fm-builder-toolbar,
  .fm-param-row { grid-template-columns: 1fr; }
}
</style>
