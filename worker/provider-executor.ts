// SPDX-License-Identifier: GPL-3.0-or-later
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../server/infrastructure/db/sqlite'
import { selectBackend, updateBackendLoad } from '../server/domain/backends'
import { getPreset, type NodeParamMapping } from '../server/domain/presets'
import { updateTaskStatus, incrementBatchProgress } from '../server/domain/batch'
import { getOnlineProvider, normalizeProviderId } from '../server/infrastructure/providers/registry'
import { getProviderRuntimeConfig } from '../server/infrastructure/providers/settings'
import { ensureBatchImageOutputDir, sanitizeOutputFileName } from '../server/infrastructure/storage/outputs'
import type { BackendScheduleMode } from '../shared/types/app'
import type { GenerateImageInput, ProviderImageArtifact } from '../server/infrastructure/providers/types'

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
  const providerId = typeof inputParams._providerId === 'string' ? inputParams._providerId : undefined
  const backendType = providerId === 'gpt-image-2' ? 'codex-cli' : 'provider'

  const decision = selectBackend({
    backendType,
    backendIds: requestedBackendId ? [requestedBackendId] : preset?.backendId ? [preset.backendId] : undefined,
    mode: scheduleMode
  }, workspaceId)

  if (!decision.backendId) {
    throw new Error(`No eligible online API backend: ${decision.reasons.join(', ')}`)
  }

  const backend = db.prepare('SELECT * FROM backends WHERE id = ?').get(decision.backendId) as Record<string, unknown> | undefined
  if (!backend) throw new Error('Selected backend disappeared')
  if (backend.type !== 'provider' && backend.type !== 'codex-cli') throw new Error('Selected backend is not an online API backend')

  const resolvedProviderId = typeof inputParams._providerId === 'string' ? inputParams._providerId : normalizeProviderId(backend.endpoint as string)
  const provider = getOnlineProvider(resolvedProviderId)
  const config = getProviderRuntimeConfig(workspaceId, resolvedProviderId)
  const imageInput = directInput
    ? buildDirectImageInput(inputParams, config.model)
    : buildImageInput(inputParams, preset?.nodeParams || [], config.model)

  const started = updateTaskStatus(taskId, 'running', {
    backendId: decision.backendId,
    scheduleDecision: decision,
    submittedPayload: imageInput,
    externalTaskId: `provider-${Date.now()}`
  })
  if (!started) throw new Error('Task was canceled before provider submission')
  updateBackendLoad(decision.backendId, 1, 0)

  try {
    console.log(`[provider-executor] Generating image for task ${taskId}`)
    const generated = await provider.generateImage(config, imageInput)
    console.log(`[provider-executor] Generated ${generated.artifacts.length} artifacts`)
    
    const outputs = await persistProviderArtifacts({
      taskId,
      batchRunId,
      workspaceId,
      providerId: resolvedProviderId,
      model: generated.model,
      prompt: imageInput.prompt,
      artifacts: generated.artifacts
    })
    console.log(`[provider-executor] Persisted ${outputs.length} outputs`)

    const completed = updateTaskStatus(taskId, 'succeeded', {
      resultJson: {
        providerId: resolvedProviderId,
        model: generated.model,
        outputs
      }
    })
    if (completed) incrementBatchProgress(batchRunId, 'completed_tasks')
    console.log(`[provider-executor] Task ${taskId} completed successfully`)
  } catch (error) {
    console.error(`[provider-executor] Task ${taskId} failed:`, error)
    throw error
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
  const validSizes: string[] = [
    '1K', '2K', '4K',
    '1024x1024', '1024x1536', '1536x1024',
    '1152x1536', '1536x1152',
    '1080x1920', '1920x1080',
    '1080x2520', '2520x1080',
    'auto'
  ]
  return typeof value === 'string' && validSizes.includes(value) ? value as GenerateImageInput['size'] : '1024x1024'
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
  console.log(`[persistProviderArtifacts] Starting for task ${input.taskId}`)
  console.log(`[persistProviderArtifacts] Artifacts count: ${input.artifacts.length}`)
  
  if (!input.artifacts.length) throw new Error('在线 API 未返回图片结果')

  const db = getSqlite()
  const batch = db.prepare('SELECT created_at FROM batch_runs WHERE id = ?').get(input.batchRunId) as Record<string, unknown> | undefined
  const imageOutputDir = ensureBatchImageOutputDir({
    batchRunId: input.batchRunId,
    createdAt: Number(batch?.created_at || Date.now())
  })
  console.log(`[persistProviderArtifacts] Output dir: ${imageOutputDir}`)
  
  const outputs: Array<{ filename: string; path: string; type: string; size: number }> = []

  for (const artifact of input.artifacts) {
    console.log(`[persistProviderArtifacts] Processing artifact ${artifact.index}: mimeType=${artifact.mimeType}, url=${artifact.url}`)
    
    const buffer = await artifactToBuffer(artifact)
    console.log(`[persistProviderArtifacts] Buffer size: ${buffer.length}`)
    
    const extension = extensionForMime(artifact.mimeType)
    const filename = sanitizeOutputFileName(`${input.taskId}_provider_${artifact.index}.${extension}`)
    const filePath = join(imageOutputDir, filename)
    
    console.log(`[persistProviderArtifacts] Writing file: ${filePath}`)
    writeFileSync(filePath, buffer)

    console.log(`[persistProviderArtifacts] Inserting into database`)
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
    console.log(`[persistProviderArtifacts] Artifact ${artifact.index} processed successfully`)
  }

  console.log(`[persistProviderArtifacts] Completed with ${outputs.length} outputs`)
  return outputs
}

async function artifactToBuffer(artifact: ProviderImageArtifact) {
  if (artifact.b64Json) return Buffer.from(artifact.b64Json, 'base64')
  if (!artifact.url) throw new Error('在线 API 图片结果缺少 b64_json 或 url')
  
  console.log(`[provider-executor] Processing artifact URL: ${artifact.url}`)
  
  // Handle local file:// URLs
  if (artifact.url.startsWith('file://')) {
    const filePath = artifact.url.replace('file://', '')
    console.log(`[provider-executor] Reading local file from file:// URL: ${filePath}`)
    if (!existsSync(filePath)) {
      throw new Error(`本地文件不存在: ${filePath}`)
    }
    return readFileSync(filePath)
  }
  
  // Handle local file paths (Windows paths like E:\... or Unix paths like /...)
  if (artifact.url.match(/^[A-Z]:\\/) || artifact.url.startsWith('/')) {
    console.log(`[provider-executor] Reading local file path: ${artifact.url}`)
    if (!existsSync(artifact.url)) {
      throw new Error(`本地文件不存在: ${artifact.url}`)
    }
    return readFileSync(artifact.url)
  }
  
  // Handle remote URLs
  console.log(`[provider-executor] Fetching remote URL: ${artifact.url}`)
  const response = await fetch(artifact.url)
  if (!response.ok) throw new Error(`下载在线 API 图片失败: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  return 'png'
}
