<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">运行</h1>
        <p class="fm-page-subtitle">文件会先在浏览器暂存；替换和删除只影响待运行队列，点击运行时才提交有效文件。</p>
      </div>
      <ElButton class="fm-run-submit-desktop" type="primary" :loading="submitting" @click="startRun">开始运行</ElButton>
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
              <ElOption v-for="preset in presets" :key="preset.id" :label="preset.name" :value="preset.id" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="任务名称">
            <ElInput v-model="form.name" placeholder="留空则使用调用配置名称" />
          </ElFormItem>
          <ElFormItem label="执行实例">
            <ElSelect v-model="form.backendId" filterable placeholder="自动调度" style="width: 100%">
              <ElOption label="自动调度" value="" />
              <ElOption
                v-for="backend in backends"
                :key="backend.id"
                :label="backendOptionLabel(backend)"
                :value="backend.id"
                :disabled="!backend.enabled || backend.paused" />
            </ElSelect>
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
            <span>运行会记录本次提交的参数和候选值；结果页可按不同展现形式查看产物。</span>
          </div>
        </div>
      </section>

      <BatchRuntimeInputs
        ref="runtimeInputRef"
        :params="runtimeParams"
        mode="cartesian"
        :preset="selectedPreset"
        :backend-id="selectedRuntimeBackendId"
        @estimate-change="estimatedTaskCount = $event" />
    </div>

    <div class="fm-run-submit-bar">
      <ElButton type="primary" :loading="submitting" @click="startRun">开始运行</ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import BatchRuntimeInputs from './BatchRuntimeInputs.vue'

const COPIED_TASK_STORAGE_KEY = 'flowmatrix.copied-task'

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
  backendId?: string | null
  backendGroupId?: string | null
  nodeParams: NodeParam[]
}

interface Backend {
  id: string
  name: string
  enabled: boolean
  paused?: boolean
  healthStatus: string
}

const route = useRoute()
const presets = ref<Preset[]>([])
const backends = ref<Backend[]>([])
const submitting = ref(false)
const estimatedTaskCount = ref<string | number>(1)
const runtimeInputRef = ref<{
  collectParams: () => Promise<Record<string, unknown[]> | null>
  applyCopiedParams: (params: Record<string, unknown>) => { applied: number; skippedFiles: number }
} | null>(null)
const form = reactive({
  presetId: '',
  name: '',
  backendId: '',
  mode: 'cartesian'
})

const selectedPreset = computed(() => presets.value.find(preset => preset.id === form.presetId) || null)
const runtimeParams = computed(() => selectedPreset.value?.nodeParams.filter(param => param.runtimeInput) || [])
const fixedParamCount = computed(() => selectedPreset.value?.nodeParams.filter(param => !param.runtimeInput).length || 0)
const selectedRuntimeBackendId = computed(() => form.backendId)

watch(runtimeParams, (params) => {
  estimatedTaskCount.value = params.length ? '待填写' : 1
})

async function fetchPresets() {
  const [presetRows, backendRows] = await Promise.all([
    $fetch<Preset[]>('/api/v1/presets'),
    $fetch<Backend[]>('/api/v1/backends')
  ])
  presets.value = presetRows
  backends.value = backendRows
  const copied = readCopiedTask()
  const requestedPresetId = typeof route.query.presetId === 'string' ? route.query.presetId : ''
  const targetPresetId = copied?.presetId || requestedPresetId
  form.presetId = presets.value.some(preset => preset.id === targetPresetId)
    ? targetPresetId
    : presets.value.some(preset => preset.id === requestedPresetId)
    ? requestedPresetId
    : presets.value[0]?.id || ''

  if (copied) {
    // Wait for the runtime inputs component to receive updated params after presetId changes
    await nextTick()
    await nextTick()
    const result = runtimeInputRef.value?.applyCopiedParams(copied.inputParams)
    if (result) {
      const skipped = result.skippedFiles ? `，${result.skippedFiles} 个文件参数需要重新选择` : ''
      ElMessage.success(`已复制 ${result.applied} 个参数${skipped}`)
    }
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
    const params = await runtimeInputRef.value?.collectParams()
    if (!params) return

    const run = await $fetch<{ id: string }>('/api/v1/batch', {
      method: 'POST',
      body: {
        name: form.name,
        presetId: preset.id,
        workflowId: preset.workflowId,
        scheduleMode: preset.scheduleMode,
        backendId: selectedRuntimeBackendId.value || undefined,
        matrix: {
          mode: form.mode,
          params
        }
      }
    })
    ElMessage.success('任务已创建')
    await navigateTo(`/gallery?batchRunId=${run.id}`)
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '创建失败')
  } finally {
    submitting.value = false
  }
}

function backendOptionLabel(backend: Backend) {
  const state = !backend.enabled ? '已禁用' : backend.paused ? '已暂停' : backend.healthStatus || 'unknown'
  return `${backend.name} · ${state}`
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

function readCopiedTask() {
  if (!import.meta.client) return null
  const raw = sessionStorage.getItem(COPIED_TASK_STORAGE_KEY)
  if (!raw) return null
  sessionStorage.removeItem(COPIED_TASK_STORAGE_KEY)
  try {
    const parsed = JSON.parse(raw) as { presetId?: string; inputParams?: Record<string, unknown> }
    if (!parsed.presetId || !parsed.inputParams) return null
    return { presetId: parsed.presetId, inputParams: parsed.inputParams }
  } catch {
    return null
  }
}

onMounted(() => {
  void fetchPresets()
})
</script>

<style scoped>
.fm-run-grid {
  display: grid;
  gap: 16px;
  align-items: start;
  min-width: 0;
}

.fm-config-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.fm-page-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
  min-width: 0;
}

.fm-run-submit-bar {
  display: none;
}

.fm-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.fm-panel-heading > div {
  display: grid;
  gap: 3px;
  min-width: 0;
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

.fm-config-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
  min-width: 0;
}

.fm-config-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.fm-config-meta {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.fm-preset-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.fm-preset-summary div {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 72%, transparent);
}

.fm-preset-summary span,
.fm-config-note span {
  color: var(--fm-muted);
  font-size: 12px;
}

.fm-preset-summary strong,
.fm-config-note strong {
  overflow: hidden;
  color: var(--fm-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-config-note {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--fm-primary) 26%, var(--fm-border));
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-primary) 9%, var(--fm-panel-muted));
}

.fm-config-note span {
  line-height: 1.55;
}

@media (max-width: 760px) {
  .fm-config-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .fm-page-header,
  .fm-config-panel {
    grid-template-columns: 1fr;
  }

  .fm-page-header {
    gap: 14px;
  }

  .fm-run-submit-desktop {
    display: none;
  }

  .fm-run-submit-bar {
    position: fixed;
    right: 10px;
    bottom: 78px;
    left: 10px;
    z-index: 19;
    display: block;
    padding: 8px;
    border: 1px solid color-mix(in srgb, var(--fm-border) 78%, var(--fm-glass-edge));
    border-radius: var(--fm-radius);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--fm-glass-edge) 10%, transparent), transparent 38%),
      color-mix(in srgb, var(--fm-panel) 92%, transparent);
    box-shadow: var(--fm-shadow);
    backdrop-filter: blur(var(--fm-blur)) saturate(1.12);
    -webkit-backdrop-filter: blur(var(--fm-blur)) saturate(1.12);
  }

  .fm-run-submit-bar .el-button {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .fm-config-panel {
    gap: 12px;
  }

  .fm-page-subtitle {
    overflow-wrap: anywhere;
  }

  .fm-panel-heading {
    align-items: flex-start;
  }

  .fm-preset-summary {
    grid-template-columns: 1fr;
  }
}
</style>
