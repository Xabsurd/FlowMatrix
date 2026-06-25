<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="fm-page">
    <div class="fm-page-header">
      <div>
        <h1 class="fm-page-title">工作流管理</h1>
        <p class="fm-page-subtitle">上传 ComfyUI API Workflow JSON，解析节点并建立参数映射。</p>
      </div>
      <ElButton type="primary" @click="openUploadDialog">上传工作流</ElButton>
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
              <!-- <ElTag class="fm-slug-tag" size="small" type="info" effect="plain">{{ workflow.slug }}</ElTag> -->
            </div>
            <p class="fm-workflow-purpose">{{ workflowPurpose(workflow) }}</p>
            <p class="fm-workflow-description">{{ workflowDescription(workflow) }}</p>
          </div>
        </div>

        <div class="fm-workflow-facts">
          <div>
            <span>类型</span>
            <strong>{{ workflowKind(workflow) }}</strong>
          </div>
          <div>
            <span>节点</span>
            <strong>{{ workflow.parsedNodes?.length || 0 }}</strong>
          </div>
          <div>
            <span>版本</span>
            <strong>v{{ workflow.version }}</strong>
          </div>
          <div>
            <span>更新时间</span>
            <strong>{{ formatTime(workflow.updatedAt) }}</strong>
          </div>
        </div>

        <div class="fm-workflow-footer">
          <div class="fm-workflow-tags">
            <ElSelect
              v-model="tagDrafts[workflow.id]"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="添加标签"
              size="small"
              @change="saveWorkflowTags(workflow)"
            >
              <ElOption
                v-for="tag in allTags"
                :key="tag"
                :label="tag"
                :value="tag"
              />
            </ElSelect>
          </div>
          <div class="fm-card-actions">
            <ElButton text @click="openEditDialog(workflow)">编辑</ElButton>
            <ElButton text type="danger" @click="removeWorkflow(workflow)">删除</ElButton>
          </div>
        </div>
      </article>
    </div>

    <ElEmpty v-else-if="!loading" description="暂无工作流，点击「上传工作流」导入 ComfyUI API JSON。" />

    <ElDialog v-model="showUploadDialog" :title="editingId ? '编辑工作流' : '上传工作流'" width="680px">
      <ElForm label-position="top">
        <ElFormItem label="工作流名称" required>
          <ElInput v-model="form.name" placeholder="例如：SDXL 海报生成" />
        </ElFormItem>
        <ElFormItem label="标签">
          <ElSelect
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="选择已有标签，或输入后回车新建"
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
        <ElFormItem label="JSON 文件">
          <ElUpload
            class="fm-workflow-upload"
            drag
            :auto-upload="false"
            :show-file-list="false"
            accept=".json,application/json"
            :on-change="readWorkflowFile"
          >
            <FmIcon class="fm-upload-icon" name="uploadCloud" :size="32" />
            <div class="el-upload__text">拖拽 JSON 到这里，或点击选择文件</div>
          </ElUpload>
        </ElFormItem>
        <ElCollapse class="fm-json-collapse">
          <ElCollapseItem title="工作流 JSON" name="json">
            <ElFormItem required>
              <ElInput
                v-model="form.jsonText"
                type="textarea"
                :rows="12"
                placeholder="粘贴 ComfyUI 导出的 API Workflow JSON"
              />
            </ElFormItem>
          </ElCollapseItem>
        </ElCollapse>
      </ElForm>
      <template #footer>
        <ElButton @click="showUploadDialog = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveWorkflow">{{ editingId ? '保存修改' : '保存工作流' }}</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'

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
const tagDrafts = reactive<Record<string, string[]>>({})
const form = reactive({
  name: '',
  jsonText: '',
  tags: [] as string[]
})

const allTags = computed(() => {
  const tags = new Set<string>()
  for (const workflow of workflows.value) {
    for (const tag of workflowTags(workflow)) tags.add(tag)
  }
  for (const tag of form.tags) tags.add(tag)
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

async function fetchWorkflows() {
  loading.value = true
  try {
    workflows.value = await $fetch<Workflow[]>('/api/v1/workflows')
    syncTagDrafts()
  } finally {
    loading.value = false
  }
}

function openUploadDialog() {
  editingId.value = ''
  form.name = ''
  form.jsonText = ''
  form.tags = []
  showUploadDialog.value = true
}

function openEditDialog(workflow: Workflow) {
  editingId.value = workflow.id
  form.name = workflow.name
  form.jsonText = JSON.stringify(workflow.rawJson || {}, null, 2)
  form.tags = [...workflowTags(workflow)]
  showUploadDialog.value = true
}

async function readWorkflowFile(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  const text = await raw.text()
  form.jsonText = text
  if (!form.name) {
    form.name = file.name.replace(/\.json$/i, '')
  }
}

async function saveWorkflow() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写工作流名称')
    return
  }

  let rawJson: Record<string, unknown>
  try {
    rawJson = JSON.parse(form.jsonText) as Record<string, unknown>
  } catch {
    ElMessage.error('工作流 JSON 格式不正确')
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
    ElMessage.success(editingId.value ? '工作流已更新' : '工作流已保存')
  } catch (error: unknown) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function saveWorkflowTags(workflow: Workflow) {
  const tags = normalizeTags(tagDrafts[workflow.id] || [])
  tagDrafts[workflow.id] = tags
  try {
    const updated = await $fetch<Workflow>(`/api/v1/workflows/${workflow.id}`, {
      method: 'PATCH',
      body: {
        metadata: { tags }
      }
    })
    const index = workflows.value.findIndex(item => item.id === workflow.id)
    if (index >= 0) workflows.value[index] = updated
    tagDrafts[workflow.id] = workflowTags(updated)
  } catch (error: unknown) {
    tagDrafts[workflow.id] = workflowTags(workflow)
    ElMessage.error(error instanceof Error ? error.message : '标签保存失败')
  }
}

async function removeWorkflow(workflow: Workflow) {
  try {
    await ElMessageBox.confirm(`确定删除「${workflow.name}」？相关调用配置不会自动删除，请确认没有继续使用它。`, '删除工作流', { type: 'warning' })
    await $fetch(`/api/v1/workflows/${workflow.id}`, { method: 'DELETE' })
    await fetchWorkflows()
    ElMessage.success('工作流已删除')
  } catch (error: unknown) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value)
}

function workflowInitial(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || 'WF'
}

function workflowKind(workflow: Workflow) {
  const nodes = workflow.parsedNodes || []
  if (nodes.some(node => /video/i.test(node.nodeType))) return '视频工作流'
  if (nodes.some(node => /upscale|scale/i.test(node.nodeType))) return '放大修复'
  if (nodes.some(node => /loadimage|image/i.test(node.nodeType))) return '图像处理'
  if (nodes.some(node => /ksampler|sampler/i.test(node.nodeType))) return '图像生成'
  return '通用工作流'
}

function workflowPurpose(workflow: Workflow) {
  const nodes = workflow.parsedNodes || []
  const hasText = nodes.some(node => /cliptextencode|prompt|text/i.test(node.nodeType))
  const hasImage = nodes.some(node => /loadimage|image/i.test(node.nodeType))
  const hasSave = nodes.some(node => /saveimage|previewimage|output/i.test(node.nodeType))
  const parts = []
  if (hasText) parts.push('文本提示词')
  if (hasImage) parts.push('图片输入')
  if (hasSave) parts.push('结果输出')
  return parts.length ? `用于${parts.join('、')}的${workflowKind(workflow)}` : '用于批量提交和执行的 ComfyUI API 工作流'
}

function workflowDescription(workflow: Workflow) {
  const nodeCount = workflow.parsedNodes?.length || 0
  const inputCount = (workflow.parsedNodes || []).reduce((sum, node) => sum + Object.keys(node.inputs || {}).length, 0)
  const size = formatJsonSize(workflow.rawJson)
  return `${nodeCount} 个节点，约 ${inputCount} 个可解析输入，JSON ${size}。`
}

function formatJsonSize(value: Record<string, unknown>) {
  const bytes = new Blob([JSON.stringify(value || {})]).size
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

function syncTagDrafts() {
  const activeIds = new Set(workflows.value.map(workflow => workflow.id))
  for (const workflow of workflows.value) {
    tagDrafts[workflow.id] = workflowTags(workflow)
  }
  for (const id of Object.keys(tagDrafts)) {
    if (!activeIds.has(id)) Reflect.deleteProperty(tagDrafts, id)
  }
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
.fm-workflow-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--fm-border); padding-top: 12px; }
.fm-workflow-tags { min-width: min(100%, 320px); flex: 1; }
.fm-workflow-tags :deep(.el-select) { width: 100%; }
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
.fm-json-collapse {
  border-top: 1px solid var(--fm-border);
  border-bottom: 1px solid var(--fm-border);
}
.fm-json-collapse :deep(.el-collapse-item__header) {
  padding: 0 2px;
  color: var(--fm-muted);
  font-weight: 650;
}
.fm-json-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}
@media (max-width: 720px) {
  .fm-workflow-list { grid-template-columns: 1fr; }
  .fm-workflow-main { grid-template-columns: 1fr; }
  .fm-workflow-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fm-workflow-footer { align-items: flex-start; flex-direction: column; }
}
</style>
