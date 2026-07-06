// SPDX-License-Identifier: GPL-3.0-or-later
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../server/infrastructure/db/sqlite'
import { selectBackend, updateBackendLoad, updateBackendModelSignature, markBackendUnhealthy } from '../server/domain/backends'
import { getWorkflow } from '../server/domain/workflows'
import { getPreset } from '../server/domain/presets'
import { updateTaskStatus, incrementBatchProgress } from '../server/domain/batch'
import * as comfyui from '../server/infrastructure/comfyui/client'
import { ensureBatchImageOutputDir, sanitizeOutputFileName } from '../server/infrastructure/storage/outputs'
import type { BackendScheduleMode } from '../shared/types/app'

const POLL_INTERVAL_MS = 2000

export async function executeComfyUITask(taskId: string): Promise<void> {
  const db = getSqlite()
  const task = db.prepare('SELECT * FROM run_tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined
  if (!task) throw new Error(`Task ${taskId} not found`)

  const workflowId = task.workflow_id as string
  const presetId = task.preset_id as string
  const inputParams = JSON.parse((task.input_params as string) || '{}')
  const requestedBackendId = typeof inputParams._backendId === 'string' ? inputParams._backendId : undefined
  const batchRunId = task.batch_run_id as string
  const workspaceId = task.workspace_id as string

  const workflow = getWorkflow(workflowId)
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`)

  const preset = getPreset(presetId)
  const scheduleMode = (preset?.scheduleMode || 'idle-first') as BackendScheduleMode

  const requiredResources = extractRequiredResources(inputParams, preset?.nodeParams || [])

  const decision = selectBackend({
    backendIds: requestedBackendId ? [requestedBackendId] : preset?.backendId ? [preset.backendId] : undefined,
    groupId: requestedBackendId ? undefined : preset?.backendGroupId || undefined,
    requiredResources,
    mode: scheduleMode
  }, workspaceId)

  if (!decision.backendId) {
    const rejected = decision.rejectedBackends?.length
      ? `; rejected: ${decision.rejectedBackends.map(item => `${item.backendId.slice(0, 8)} ${item.reason}`).join('; ')}`
      : ''
    throw new Error(`No eligible backend: ${decision.reasons.join(', ')}${rejected}`)
  }

  updateTaskStatus(taskId, 'queued', {
    backendId: decision.backendId,
    scheduleDecision: decision
  })

  const backend = db.prepare('SELECT * FROM backends WHERE id = ?').get(decision.backendId) as Record<string, unknown>
  if (!backend) throw new Error('Selected backend disappeared')

  const endpoint = (backend.endpoint as string).endsWith('/') ? (backend.endpoint as string).slice(0, -1) : (backend.endpoint as string)

  const rawWorkflow = JSON.parse(JSON.stringify(workflow.rawJson))
  const patchedWorkflow = await applyParams(rawWorkflow, inputParams, preset?.nodeParams || [], endpoint)

  const sig = comfyui.extractModelSignature(patchedWorkflow)
  updateBackendModelSignature(decision.backendId, sig)

  // Check if we already have an external task ID (retry case) - skip resubmission
  const existingExternalTaskId = task.external_task_id as string | null
  let externalPromptId: string

  if (existingExternalTaskId) {
    // Prompt was already submitted in a previous attempt - just continue polling
    externalPromptId = existingExternalTaskId
    updateTaskStatus(taskId, 'queued')
  } else {
    const clientId = `flowmatrix-${taskId}`
    let promptResponse: comfyui.ComfyUIPromptResponse
    try {
      promptResponse = await comfyui.submitPrompt(endpoint, patchedWorkflow, clientId)
    } catch (error) {
      markBackendUnhealthy(decision.backendId)
      throw error
    }
    externalPromptId = promptResponse.prompt_id
    updateTaskStatus(taskId, 'queued', { externalTaskId: externalPromptId })
  }

  let history: comfyui.ComfyUIHistoryItem | null = null

  while (!history) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    const currentTask = db.prepare('SELECT status FROM run_tasks WHERE id = ?').get(taskId) as { status: string } | undefined
    if (currentTask && (currentTask.status === 'canceled' || currentTask.status === 'canceling')) {
      try {
        await comfyui.interruptPrompt(endpoint)
      } catch (error) {
        if (error instanceof Error) markBackendUnhealthy(decision.backendId)
      }
      throw new Error('Task was canceled by user')
    }

    try {
      history = await comfyui.getHistory(endpoint, externalPromptId)
      if (history && !history.status.completed) history = null
    } catch {
      history = null
    }

    try {
      const q = await comfyui.getQueueInfo(endpoint)
      const counts = comfyui.getQueueCounts(q)
      const queueState = comfyui.getPromptQueueState(q, externalPromptId)
      updateBackendLoad(decision.backendId, counts.running, counts.pending)
      if (queueState === 'running') {
        updateTaskStatus(taskId, 'running')
      } else if (queueState === 'pending') {
        updateTaskStatus(taskId, 'queued')
      }
    } catch (error) {
      if (error instanceof Error && /ECONNREFUSED|ENOTFOUND|timed out/i.test(error.message)) {
        markBackendUnhealthy(decision.backendId)
      }
    }
  }

  if (history.status.status_str === 'error') {
    const errorMsg = history.status.messages.map(m => JSON.stringify(m)).join('\n')
    throw new Error(`ComfyUI error: ${errorMsg}`)
  }

  const batch = db.prepare('SELECT created_at FROM batch_runs WHERE id = ?').get(batchRunId) as Record<string, unknown> | undefined
  const imageOutputDir = ensureBatchImageOutputDir({
    batchRunId,
    createdAt: Number(batch?.created_at || Date.now())
  })

  const results: Array<{ filename: string; path: string; type: string; size: number }> = []
  const enabledOutputNodes = new Set((preset?.outputNodes || [])
    .filter(node => node.enabled)
    .map(node => node.nodeId))

  for (const [nodeId, output] of Object.entries(history.outputs)) {
    if (preset?.outputNodes?.length && !enabledOutputNodes.has(nodeId)) continue

    if (output.images) {
      for (let i = 0; i < output.images.length; i++) {
        const img = output.images[i]
        const buffer = await comfyui.getImage(endpoint, img.filename, img.subfolder, img.type)
        const filename = sanitizeOutputFileName(`${taskId}_${nodeId}_${i}_${img.filename}`)
        const filePath = join(imageOutputDir, filename)
        writeFileSync(filePath, buffer)

        const resultId = randomUUID()
        db.prepare(`
          INSERT INTO run_results (id, task_id, batch_run_id, workspace_id, output_type, storage_driver, storage_key, file_name, mime_type, file_size, metadata, created_at)
          VALUES (?, ?, ?, ?, 'image', 'local', ?, ?, 'image/png', ?, ?, ?)
        `).run(resultId, taskId, batchRunId, workspaceId, filePath, filename, buffer.length, JSON.stringify({ nodeId, source: img }), Date.now())

        results.push({ filename, path: filePath, type: 'image', size: buffer.length })
      }
    }
  }

  updateTaskStatus(taskId, 'succeeded', {
    resultJson: { outputs: results, promptId: externalPromptId }
  })
  incrementBatchProgress(batchRunId, 'completed_tasks')
}

function extractRequiredResources(
  inputParams: Record<string, unknown>,
  nodeParams: Array<{ nodeId: string; nodeType: string; inputName: string; inferredType: string; runtimeInput?: boolean; defaultValue?: unknown }>
): Array<{ type: string; name: string }> {
  const resources: Array<{ type: string; name: string }> = []
  for (const mapping of nodeParams) {
    const paramKey = `${mapping.nodeId}.${mapping.inputName}`
    const value = mapping.runtimeInput ? inputParams[paramKey] : mapping.defaultValue
    if (mapping.inferredType === 'MODEL' && value) {
      const type = inferResourceType(mapping.nodeType, mapping.inputName)
      if (type) resources.push({ type, name: String(value) })
    }
  }
  return resources
}

function inferResourceType(nodeType: string, inputName: string): string | null {
  if (nodeType === 'CheckpointLoaderSimple' && inputName === 'ckpt_name') return 'checkpoint'
  if (nodeType === 'LoraLoader' && inputName === 'lora_name') return 'lora'
  if (nodeType === 'VAELoader' && inputName === 'vae_name') return 'vae'
  if (nodeType === 'UNETLoader' && inputName === 'unet_name') return 'unet'
  if (nodeType === 'ControlNetLoader') return 'controlnet'
  if (nodeType === 'UpscaleModelLoader') return 'upscale'
  if (nodeType === 'EmbeddingLoader') return 'embedding'
  return null
}

function applyParams(
  workflow: Record<string, unknown>,
  inputParams: Record<string, unknown>,
  nodeParams: Array<{ nodeId: string; inputName: string; inferredType?: string; runtimeInput?: boolean; defaultValue?: unknown }>,
  endpoint: string
): Promise<Record<string, unknown>> {
  const patched = JSON.parse(JSON.stringify(workflow)) as Record<string, Record<string, unknown>>

  return Promise.all(nodeParams.map(async (mapping) => {
    const paramKey = `${mapping.nodeId}.${mapping.inputName}`
    const hasRuntimeValue = paramKey in inputParams
    if (mapping.runtimeInput && !hasRuntimeValue) return
    if (!mapping.runtimeInput && mapping.defaultValue === undefined) return

    const node = patched[mapping.nodeId]
    if (!node || !node.inputs) return

    const inputs = node.inputs as Record<string, unknown>
    let value = mapping.runtimeInput ? inputParams[paramKey] : mapping.defaultValue

    if (value === -1 && mapping.inputName === 'seed') {
      value = Math.floor(Math.random() * 2 ** 32)
    }

    if (mapping.inferredType === 'IMAGE' && isRuntimeAsset(value)) {
      const uploaded = await comfyui.uploadImage(
        endpoint,
        readFileSync(value.storageKey),
        value.fileName,
        value.mimeType
      )
      value = uploaded.name
    } else if (mapping.inferredType === 'FILE' && isRuntimeAsset(value)) {
      value = value.storageKey
    }

    inputs[mapping.inputName] = value
  })).then(() => patched)
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
