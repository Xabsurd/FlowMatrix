<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">{{ t('workflows.title') }}</h1>
        <p class="fm-page-subtitle">{{ t('workflows.subtitle') }}</p>
      </div>
      <ElButton type="primary" @click="openUploadDialog">{{ t('workflows.upload') }}</ElButton>
    </div>

    <div v-if="workflows.length" class="fm-workflow-list">
      <article v-for="workflow in workflows" :key="workflow.id" class="fm-workflow-card fm-card">
        <div class="fm-workflow-main">
          <div class="fm-workflow-mark">
            {{ workflowInitial(workflow.name) }}
          </div>
          <div class="fm-workflow-copy">
            <div class="fm-workflow-title-row">
              <h3>{{ workflow.name }}</h3>
            </div>
            <p class="fm-workflow-purpose">{{ workflowPurpose(workflow) }}</p>
            <p class="fm-workflow-description">{{ workflowDescription(workflow) }}</p>
          </div>
        </div>

        <div class="fm-workflow-facts">
          <div>
            <span>{{ t('workflows.type') }}</span>
            <strong>{{ workflowKind(workflow) }}</strong>
          </div>
          <div>
            <span>{{ t('workflows.nodes') }}</span>
            <strong>{{ workflow.parsedNodes?.length || 0 }}</strong>
          </div>
          <div>
            <span>{{ t('workflows.version') }}</span>
            <strong>v{{ workflow.version }}</strong>
          </div>
          <div>
            <span>{{ t('workflows.updatedAt') }}</span>
            <strong>{{ formatTime(workflow.updatedAt) }}</strong>
          </div>
        </div>

        <div class="fm-workflow-footer">
          <div class="fm-workflow-tags" :class="{ empty: !workflowTags(workflow).length }">
            <ElTag
              v-for="tag in workflowTags(workflow)"
              :key="tag"
              size="small"
              effect="plain"
            >
              {{ tag }}
            </ElTag>
            <span v-if="!workflowTags(workflow).length">{{ t('workflows.noTags') }}</span>
          </div>
          <div class="fm-card-actions">
            <ElButton text :size="rowActionSize" @click="openEditDialog(workflow)">{{ t('workflows.edit') }}</ElButton>
            <ElButton text :size="rowActionSize" type="danger" @click="removeWorkflow(workflow)">{{ t('common.delete') }}</ElButton>
          </div>
        </div>
      </article>
    </div>

    <ElEmpty v-else-if="!loading" :description="t('workflows.empty')" />

    <ElDialog v-model="showUploadDialog" :title="editingId ? t('workflows.editDialog') : t('workflows.uploadDialog')" width="680px">
      <ElForm label-position="top">
        <ElFormItem :label="t('workflows.name')" required>
          <ElInput v-model="form.name" :placeholder="t('workflows.namePlaceholder')" />
        </ElFormItem>
        <ElFormItem :label="t('workflows.tags')">
          <ElSelect
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            :placeholder="t('workflows.tagsPlaceholder')"
            style="width: 100%"
          >
            <ElOption
              v-for="tag in allTags"
              :key="tag"
              :label="tag"
              :value="tag"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="t('workflows.jsonFile')">
          <div v-if="hasWorkflowJson" class="fm-uploaded-file">
            <div class="fm-uploaded-file-main">
              <div class="fm-uploaded-file-mark">JSON</div>
              <div class="fm-uploaded-file-copy">
                <strong>{{ form.fileName || t('workflows.importedJson') }}</strong>
                <span>{{ workflowFileSummary }}</span>
              </div>
            </div>
            <div class="fm-uploaded-file-facts">
              <div>
                <span>{{ t('workflows.size') }}</span>
                <strong>{{ formatBytes(currentWorkflowJsonSize) }}</strong>
              </div>
              <div>
                <span>{{ t('workflows.nodes') }}</span>
                <strong>{{ uploadedJsonInfo.nodeCount }}</strong>
              </div>
              <div>
                <span>{{ t('workflows.inputs') }}</span>
                <strong>{{ uploadedJsonInfo.inputCount }}</strong>
              </div>
            </div>
            <div class="fm-uploaded-file-actions">
              <ElUpload
                :auto-upload="false"
                :show-file-list="false"
                accept=".json,application/json"
                :on-change="readWorkflowFile"
              >
                <ElButton :size="rowActionSize">{{ t('workflows.reupload') }}</ElButton>
              </ElUpload>
              <ElButton :size="rowActionSize" type="danger" plain @click="clearWorkflowFile">{{ t('workflows.deleteFile') }}</ElButton>
            </div>
          </div>
          <ElUpload
            v-else
            class="fm-workflow-upload"
            drag
            :auto-upload="false"
            :show-file-list="false"
            accept=".json,application/json"
            :on-change="readWorkflowFile"
          >
            <FmIcon class="fm-upload-icon" name="uploadCloud" :size="32" />
            <div class="el-upload__text">{{ t('workflows.uploadDrop') }}</div>
          </ElUpload>
        </ElFormItem>
        <ElCollapse class="fm-json-collapse">
          <ElCollapseItem :title="t('workflows.json')" name="json">
            <ElFormItem required>
              <ElInput
                v-model="form.jsonText"
                type="textarea"
                :rows="12"
                :placeholder="t('workflows.jsonPlaceholder')"
              />
            </ElFormItem>
          </ElCollapseItem>
        </ElCollapse>
      </ElForm>
      <template #footer>
        <ElButton @click="showUploadDialog = false">{{ t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveWorkflow">{{ editingId ? t('workflows.saveChanges') : t('workflows.saveWorkflow') }}</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'

const { t, locale } = useI18n()
const { rowActionSize } = useUiPreferences()

interface ParsedNode {
  nodeId: string
  nodeType: string
  title?: string
  inputs: Record<string, unknown>
}

interface Workflow {
  id: string
  name: string
  slug: string
  version: number
  rawJson: Record<string, unknown>
  parsedNodes: ParsedNode[] | null
  metadata: Record<string, unknown> | null
  updatedAt: number
}

const workflows = ref<Workflow[]>([])
const loading = ref(false)
const saving = ref(false)
const showUploadDialog = ref(false)
const editingId = ref('')
const form = reactive({
  name: '',
  jsonText: '',
  tags: [] as string[],
  fileName: '',
  fileSize: 0,
  fileUpdatedAt: 0
})

const allTags = computed(() => {
  const tags = new Set<string>()
  for (const workflow of workflows.value) {
    for (const tag of workflowTags(workflow)) tags.add(tag)
  }
  for (const tag of form.tags) tags.add(tag)
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})
const hasWorkflowJson = computed(() => Boolean(form.jsonText.trim()))
const currentWorkflowJsonSize = computed(() => new Blob([form.jsonText]).size)
const uploadedJsonInfo = computed(() => {
  try {
    const raw = JSON.parse(form.jsonText) as Record<string, unknown>
    const nodes = Object.values(raw).filter(value => value && typeof value === 'object') as Array<Record<string, unknown>>
    return {
      nodeCount: nodes.length,
      inputCount: nodes.reduce((sum, node) => {
        const inputs = node.inputs
        return sum + (inputs && typeof inputs === 'object' ? Object.keys(inputs).length : 0)
      }, 0)
    }
  } catch {
    return { nodeCount: '-', inputCount: '-' }
  }
})
const workflowFileSummary = computed(() => {
  const updatedAt = form.fileUpdatedAt ? formatTime(form.fileUpdatedAt) : t('workflows.justNow')
  return `${formatBytes(currentWorkflowJsonSize.value)} · ${updatedAt}`
})

async function fetchWorkflows() {
  loading.value = true
  try {
    workflows.value = await $fetch<Workflow[]>('/api/v1/workflows')
  } finally {
    loading.value = false
  }
}

function openUploadDialog() {
  editingId.value = ''
  form.name = ''
  form.jsonText = ''
  form.tags = []
  form.fileName = ''
  form.fileSize = 0
  form.fileUpdatedAt = 0
  showUploadDialog.value = true
}

function openEditDialog(workflow: Workflow) {
  editingId.value = workflow.id
  form.name = workflow.name
  form.jsonText = JSON.stringify(workflow.rawJson || {}, null, 2)
  form.tags = [...workflowTags(workflow)]
  form.fileName = `${workflow.name}.json`
  form.fileSize = new Blob([form.jsonText]).size
  form.fileUpdatedAt = workflow.updatedAt
  showUploadDialog.value = true
}

async function readWorkflowFile(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  const text = await raw.text()
  form.jsonText = text
  form.fileName = file.name
  form.fileSize = raw.size
  form.fileUpdatedAt = raw.lastModified || Date.now()
  if (!form.name) {
    form.name = file.name.replace(/\.json$/i, '')
  }
}

function clearWorkflowFile() {
  form.jsonText = ''
  form.fileName = ''
  form.fileSize = 0
  form.fileUpdatedAt = 0
}

async function saveWorkflow() {
  if (!form.name.trim()) {
    ElMessage.warning(t('workflows.fillName'))
    return
  }

  let rawJson: Record<string, unknown>
  try {
    rawJson = JSON.parse(form.jsonText) as Record<string, unknown>
  } catch {
    ElMessage.error(t('workflows.invalidJson'))
    return
  }

  saving.value = true
  try {
    await $fetch(editingId.value ? `/api/v1/workflows/${editingId.value}` : '/api/v1/workflows', {
      method: editingId.value ? 'PATCH' : 'POST',
      body: {
        name: form.name.trim(),
        rawJson,
        metadata: {
          tags: normalizeTags(form.tags)
        }
      }
    })
    showUploadDialog.value = false
    await fetchWorkflows()
    ElMessage.success(editingId.value ? t('workflows.updated') : t('workflows.saved'))
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : t('workflows.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function removeWorkflow(workflow: Workflow) {
  try {
    await ElMessageBox.confirm(t('workflows.deleteConfirm', { name: workflow.name }), t('workflows.deleteTitle'), { type: 'warning' })
    await $fetch(`/api/v1/workflows/${workflow.id}`, { method: 'DELETE' })
    await fetchWorkflows()
    ElMessage.success(t('workflows.deleted'))
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : t('workflows.deleteFailed'))
  }
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value)
}

function workflowInitial(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || 'WF'
}

function workflowKind(workflow: Workflow) {
  const nodes = workflow.parsedNodes || []
  if (nodes.some(node => /video/i.test(node.nodeType))) return t('workflows.video')
  if (nodes.some(node => /upscale|scale/i.test(node.nodeType))) return t('workflows.upscale')
  if (nodes.some(node => /loadimage|image/i.test(node.nodeType))) return t('workflows.imageProcess')
  if (nodes.some(node => /ksampler|sampler/i.test(node.nodeType))) return t('workflows.imageGenerate')
  return t('workflows.generic')
}

function workflowPurpose(workflow: Workflow) {
  const nodes = workflow.parsedNodes || []
  const hasText = nodes.some(node => /cliptextencode|prompt|text/i.test(node.nodeType))
  const hasImage = nodes.some(node => /loadimage|image/i.test(node.nodeType))
  const hasSave = nodes.some(node => /saveimage|previewimage|output/i.test(node.nodeType))
  const parts = []
  if (hasText) parts.push(t('workflows.textPrompt'))
  if (hasImage) parts.push(t('workflows.imageInput'))
  if (hasSave) parts.push(t('workflows.resultOutput'))
  return parts.length ? t('workflows.purpose', { parts: parts.join(locale.value === 'zh-CN' ? '、' : ', '), kind: workflowKind(workflow) }) : t('workflows.defaultPurpose')
}

function workflowDescription(workflow: Workflow) {
  const nodeCount = workflow.parsedNodes?.length || 0
  const inputCount = (workflow.parsedNodes || []).reduce((sum, node) => sum + Object.keys(node.inputs || {}).length, 0)
  const size = formatJsonSize(workflow.rawJson)
  return t('workflows.description', { nodes: nodeCount, inputs: inputCount, size })
}

function formatJsonSize(value: Record<string, unknown>) {
  const bytes = new Blob([JSON.stringify(value || {})]).size
  return formatBytes(bytes)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function workflowTags(workflow: Workflow) {
  const tags = workflow.metadata?.tags
  return normalizeTags(Array.isArray(tags) ? tags : [])
}

function normalizeTags(tags: unknown[]) {
  return Array.from(new Set(tags
    .map(tag => String(tag).trim())
    .filter(Boolean)))
}

onMounted(fetchWorkflows)
</script>

<style scoped>
.fm-workflow-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.fm-workflow-card { display: grid; gap: 16px; max-width: 100%; }
.fm-workflow-main { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 14px; align-items: start; }
.fm-workflow-mark { display: grid; place-items: center; width: 48px; height: 48px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-primary) 13%, var(--fm-panel-muted)); color: var(--fm-text); font-size: 14px; font-weight: 800; }
.fm-workflow-copy { min-width: 0; }
.fm-workflow-title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fm-workflow-title-row h3 { min-width: 0; margin: 0; overflow: hidden; color: var(--fm-text); font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
.fm-workflow-purpose { margin: 8px 0 0; color: var(--fm-text); font-size: 14px; line-height: 1.55; }
.fm-workflow-description { margin: 4px 0 0; color: var(--fm-muted); font-size: 13px; line-height: 1.5; }
.fm-workflow-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.fm-workflow-facts div { display: grid; gap: 5px; min-width: 0; padding: 10px; border: 1px solid var(--fm-border); border-radius: var(--fm-radius); background: color-mix(in srgb, var(--fm-panel-muted) 70%, transparent); }
.fm-workflow-facts span { color: var(--fm-muted); font-size: 12px; }
.fm-workflow-facts strong { overflow: hidden; color: var(--fm-text); font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.fm-workflow-footer { display: grid; gap: 10px; border-top: 1px solid var(--fm-border); padding-top: 12px; }
.fm-workflow-tags { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.fm-workflow-tags.empty { color: var(--fm-muted); font-size: 12px; }
.fm-card-actions { display: flex; justify-self: end; flex: 0 0 auto; align-items: center; gap: 6px; }
.fm-slug-tag { max-width: min(360px, 42vw); }
.fm-slug-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fm-workflow-upload,
.fm-workflow-upload :deep(.el-upload),
.fm-workflow-upload :deep(.el-upload-dragger) {
  width: 100%;
}
.fm-workflow-upload :deep(.el-upload-dragger) {
  display: grid;
  align-content: center;
  min-height: 152px;
}
.fm-upload-icon {
  justify-self: center;
  color: var(--fm-muted);
}
.fm-uploaded-file {
  display: grid;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--fm-primary) 28%, var(--fm-border));
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-primary) 8%, var(--fm-panel-muted));
}
.fm-uploaded-file-main {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}
.fm-uploaded-file-mark {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-primary) 16%, transparent);
  color: var(--fm-text);
  font-size: 12px;
  font-weight: 800;
}
.fm-uploaded-file-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.fm-uploaded-file-copy strong {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fm-uploaded-file-copy span {
  color: var(--fm-muted);
  font-size: 12px;
}
.fm-uploaded-file-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.fm-uploaded-file-facts div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel) 62%, transparent);
}
.fm-uploaded-file-facts span {
  color: var(--fm-muted);
  font-size: 12px;
}
.fm-uploaded-file-facts strong {
  overflow: hidden;
  color: var(--fm-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fm-uploaded-file-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fm-json-collapse {
  overflow: hidden;
  border: 1px solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: color-mix(in srgb, var(--fm-panel-muted) 58%, transparent);
}
.fm-json-collapse :deep(.el-collapse-item__header) {
  padding: 0 12px;
  border-bottom-color: var(--fm-border);
  background: transparent;
  color: var(--fm-muted);
  font-weight: 650;
}
.fm-json-collapse :deep(.el-collapse-item__content) {
  padding: 12px;
  background: transparent;
}
.fm-json-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
  background: transparent;
}
@media (max-width: 720px) {
  .fm-workflow-list { grid-template-columns: 1fr; }
  .fm-workflow-main { grid-template-columns: 1fr; }
  .fm-workflow-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fm-workflow-footer { grid-template-columns: 1fr; }
  .fm-uploaded-file-facts { grid-template-columns: 1fr; }
}
</style>
