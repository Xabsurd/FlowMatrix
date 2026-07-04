// SPDX-License-Identifier: GPL-3.0-or-later
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../server/infrastructure/db/sqlite'
import { selectBackend, updateBackendLoad } from '../server/domain/backends'
import { getPreset, type NodeParamMapping } from '../server/domain/presets'
import { updateTaskStatus, incrementBatchProgress } from '../server/domain/batch'
import { getOnlineProvider, normalizeProviderId } from '../server/infrastructure/providers/registry'
import { getProviderRuntimeConfig } from '../server/infrastructure/providers/settings'
import type { BackendScheduleMode } from '../shared/types/app'
import type { GenerateImageInput, ProviderImageArtifact } from '../server/infrastructure/providers/types'

const OUTPUT_DIR = './data/outputs'

export async function executeProviderTask(taskId: string): Promise<void> {
  const db = getSqlite()
  const task = db.prepare('SELECT * FROM run_tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined
  if (!task) throw new Error(`Task ${taskId} not found`)

  const inputParams = JSON.parse((task.input_params as string) || '{}') as Record<string, unknown>
  const requestedBackendId = typeof inputParams._backendId === 'string' ? inputParams._backendId : undefined
  const batchRunId = task.batch_run_id as string
  const workspaceId = task.workspace_id as string
  const preset = getPreset(task.preset_id as string)
  const directInput = inputParams._providerDirect === true
  const scheduleMode = (directInput ? 'manual' : preset?.scheduleMode || 'manual') as BackendScheduleMode

  const decision = selectBackend({
    backendType: 'provider',
    backendIds: requestedBackendId ? [requestedBackendId] : preset?.backendId ? [preset.backendId] : undefined,
    mode: scheduleMode
  }, workspaceId)

  if (!decision.backendId) {
    throw new Error(`No eligible online API backend: ${decision.reasons.join(', ')}`)
  }

  const backend = db.prepare('SELECT * FROM backends WHERE id = ?').get(decision.backendId) as Record<string, unknown> | undefined
  if (!backend) throw new Error('Selected backend disappeared')
  if (backend.type !== 'provider') throw new Error('Selected backend is not an online API backend')

  const providerId = normalizeProviderId(backend.endpoint as string)
  const provider = getOnlineProvider(providerId)
  const config = getProviderRuntimeConfig(workspaceId, providerId)
  const imageInput = directInput
    ? buildDirectImageInput(inputParams, config.model)
    : buildImageInput(inputParams, preset?.nodeParams || [], config.model)

  updateTaskStatus(taskId, 'running', {
    backendId: decision.backendId,
    scheduleDecision: decision,
    submittedPayload: imageInput,
    externalTaskId: `provider-${Date.now()}`
  })
  updateBackendLoad(decision.backendId, 1, 0)

  try {
    const generated = await provider.generateImage(config, imageInput)
    const outputs = await persistProviderArtifacts({
      taskId,
      batchRunId,
      workspaceId,
      providerId,
      model: generated.model,
      prompt: imageInput.prompt,
      artifacts: generated.artifacts
    })

    updateTaskStatus(taskId, 'succeeded', {
      resultJson: {
        providerId,
        model: generated.model,
        outputs
      }
    })
    incrementBatchProgress(batchRunId, 'completed_tasks')
  } finally {
    updateBackendLoad(decision.backendId, 0, 0)
  }
}


function buildDirectImageInput(inputParams: Record<string, unknown>, defaultModel: string): GenerateImageInput {
  const prompt = typeof inputParams.prompt === 'string' ? inputParams.prompt.trim() : ''
  if (!prompt) throw new Error('在线 API 运行需要提示词')
  const imageInputs = Array.isArray(inputParams.imageInputs)
    ? inputParams.imageInputs.filter(isRuntimeAsset).map(asset => ({
        data: readFileSync(asset.storageKey),
        fileName: asset.fileName,
        mimeType: asset.mimeType
      }))
    : []

  return {
    prompt,
    model: typeof inputParams.model === 'string' && inputParams.model.trim() ? inputParams.model.trim() : defaultModel,
    size: normalizeSize(inputParams.size),
    quality: normalizeQuality(inputParams.quality),
    outputFormat: normalizeOutputFormat(inputParams.outputFormat),
    n: normalizeOutputCount(inputParams.n),
    imageInputs
  }
}

function normalizeSize(value: unknown): GenerateImageInput['size'] {
  return value === '1024x1536' || value === '1536x1024' || value === 'auto' ? value : '1024x1024'
}

function normalizeQuality(value: unknown): GenerateImageInput['quality'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'auto' ? value : 'auto'
}

function normalizeOutputFormat(value: unknown): GenerateImageInput['outputFormat'] {
  return value === 'webp' || value === 'jpeg' ? value : 'png'
}

function normalizeOutputCount(value: unknown) {
  const count = Number(value || 1)
  return Number.isFinite(count) ? Math.max(1, Math.min(Math.floor(count), 10)) : 1
}
function buildImageInput(
  inputParams: Record<string, unknown>,
  nodeParams: NodeParamMapping[],
  model: string
): GenerateImageInput {
  const prompt = collectPrompt(inputParams, nodeParams)
  if (!prompt) {
    throw new Error('在线 API 运行需要至少一个文本/提示词参数')
  }

  return {
    prompt,
    model,
    size: inferImageSize(inputParams, nodeParams),
    quality: inferQuality(inputParams, nodeParams),
    outputFormat: 'png',
    n: 1
  }
}

function collectPrompt(inputParams: Record<string, unknown>, nodeParams: NodeParamMapping[]) {
  const positive: string[] = []
  const negative: string[] = []

  for (const mapping of nodeParams) {
    const value = valueForMapping(inputParams, mapping)
    if (typeof value !== 'string' || !value.trim()) continue
    if (!isPromptMapping(mapping)) continue

    if (/negative|反向|负面/i.test(`${mapping.nodeType}.${mapping.inputName}`)) {
      negative.push(value.trim())
    } else {
      positive.push(value.trim())
    }
  }

  const prompt = positive.join('\n\n')
  const avoid = negative.length ? `\n\nAvoid: ${negative.join(', ')}` : ''
  return `${prompt}${avoid}`.trim()
}

function isPromptMapping(mapping: NodeParamMapping) {
  if (mapping.inferredType !== 'STRING' && mapping.inferredType !== 'ENUM') return false
  return /prompt|text|positive|negative|提示词/i.test(`${mapping.nodeType}.${mapping.inputName}`)
}

function inferImageSize(inputParams: Record<string, unknown>, nodeParams: NodeParamMapping[]): GenerateImageInput['size'] {
  const width = Number(findMappedValue(inputParams, nodeParams, /width|宽/i))
  const height = Number(findMappedValue(inputParams, nodeParams, /height|高/i))
  if (width === 1024 && height === 1536) return '1024x1536'
  if (width === 1536 && height === 1024) return '1536x1024'
  return '1024x1024'
}

function inferQuality(inputParams: Record<string, unknown>, nodeParams: NodeParamMapping[]): GenerateImageInput['quality'] {
  const quality = String(findMappedValue(inputParams, nodeParams, /quality|品质|质量/i) || '').toLowerCase()
  return ['low', 'medium', 'high', 'auto'].includes(quality)
    ? quality as GenerateImageInput['quality']
    : 'auto'
}

function findMappedValue(inputParams: Record<string, unknown>, nodeParams: NodeParamMapping[], pattern: RegExp) {
  const mapping = nodeParams.find(item => pattern.test(item.inputName))
  return mapping ? valueForMapping(inputParams, mapping) : undefined
}

function valueForMapping(inputParams: Record<string, unknown>, mapping: NodeParamMapping) {
  const key = `${mapping.nodeId}.${mapping.inputName}`
  return mapping.runtimeInput && key in inputParams ? inputParams[key] : mapping.defaultValue
}

function isRuntimeAsset(value: unknown): value is {
  storageDriver: string
  storageKey: string
  fileName: string
  mimeType?: string
} {
  if (typeof value !== 'object' || value === null) return false
  const asset = value as Record<string, unknown>
  return asset.storageDriver === 'local'
    && typeof asset.storageKey === 'string'
    && typeof asset.fileName === 'string'
}
async function persistProviderArtifacts(input: {
  taskId: string
  batchRunId: string
  workspaceId: string
  providerId: string
  model: string
  prompt: string
  artifacts: ProviderImageArtifact[]
}) {
  if (!input.artifacts.length) throw new Error('在线 API 未返回图片结果')
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })
  const taskOutputDir = join(OUTPUT_DIR, input.taskId)
  if (!existsSync(taskOutputDir)) mkdirSync(taskOutputDir, { recursive: true })

  const db = getSqlite()
  const outputs: Array<{ filename: string; path: string; type: string; size: number }> = []

  for (const artifact of input.artifacts) {
    const buffer = await artifactToBuffer(artifact)
    const extension = extensionForMime(artifact.mimeType)
    const filename = `provider_${artifact.index}.${extension}`
    const filePath = join(taskOutputDir, filename)
    writeFileSync(filePath, buffer)

    db.prepare(`
      INSERT INTO run_results (id, task_id, batch_run_id, workspace_id, output_type, storage_driver, storage_key, file_name, mime_type, file_size, metadata, created_at)
      VALUES (?, ?, ?, ?, 'image', 'local', ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.taskId,
      input.batchRunId,
      input.workspaceId,
      filePath,
      filename,
      artifact.mimeType,
      buffer.length,
      JSON.stringify({
        providerId: input.providerId,
        model: input.model,
        prompt: input.prompt,
        revisedPrompt: artifact.revisedPrompt
      }),
      Date.now()
    )

    outputs.push({ filename, path: filePath, type: 'image', size: buffer.length })
  }

  return outputs
}

async function artifactToBuffer(artifact: ProviderImageArtifact) {
  if (artifact.b64Json) return Buffer.from(artifact.b64Json, 'base64')
  if (!artifact.url) throw new Error('在线 API 图片结果缺少 b64_json 或 url')
  const response = await fetch(artifact.url)
  if (!response.ok) throw new Error(`下载在线 API 图片失败: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  return 'png'
}
