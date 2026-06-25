// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ModelSignature } from '../../../shared/types/app'

export interface ComfyUIQueueInfo {
  exec_info: { queue_running: number; queue_pending: number }
}

export interface ComfyUISystemInfo {
  devices: Array<{
    name: string
    type: string
    vram_total: number
    vram_free: number
  }>
  python_version: string
  pytorch_version: string
}

export interface ComfyUIPromptResponse {
  prompt_id: string
  number?: number
}

export interface ComfyUIHistoryItem {
  prompt_id: string
  status: { status_str: string; completed: boolean; messages: Array<[string, unknown]> }
  outputs: Record<string, ComfyUIOutput>
}

export interface ComfyUIOutput {
  images?: Array<{ filename: string; subfolder: string; type: string }>
  text?: string[]
  [key: string]: unknown
}

const TIMEOUT_MS = 10_000

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function testConnection(endpoint: string): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const data = await fetchJson<{ version?: string }>(`${endpoint}/system_stats`)
    return { ok: true, version: data.version }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export async function getQueueInfo(endpoint: string): Promise<ComfyUIQueueInfo> {
  return fetchJson<ComfyUIQueueInfo>(`${endpoint}/prompt`)
}

export async function getSystemInfo(endpoint: string): Promise<ComfyUISystemInfo> {
  return fetchJson<ComfyUISystemInfo>(`${endpoint}/system_stats`)
}

export async function getObjectInfo(endpoint: string): Promise<Record<string, ComfyUINodeInfo>> {
  return fetchJson<Record<string, ComfyUINodeInfo>>(`${endpoint}/object_info`)
}

export interface ComfyUINodeInfo {
  name: string
  display_name: string
  description: string
  category: string
  input: {
    required?: Record<string, [string | unknown[], ...unknown[]]>
    optional?: Record<string, [string | unknown[], ...unknown[]]>
  }
  output: unknown[]
  output_name: string[]
  output_node: boolean
}

// Resource lists are fetched from ComfyUI /object_info; callers decide when to persist them.
// Ceiling: no pagination needed for model lists; upgrade path: add caching if ComfyUI has thousands of models.
export async function listModels(endpoint: string, type: string): Promise<string[]> {
  const info = await getObjectInfo(endpoint)
  const nodeName = MODEL_NODE_MAP[type]
  if (!nodeName || !info[nodeName]) return []

  const inputKey = MODEL_INPUT_MAP[type]
  if (!inputKey) return []
  const inputs = info[nodeName]?.input?.required
  const input = inputs?.[inputKey]
  if (!input) return []

  const values = input[0]
  return Array.isArray(values) ? values as string[] : []
}

const MODEL_NODE_MAP: Record<string, string> = {
  checkpoint: 'CheckpointLoaderSimple',
  lora: 'LoraLoader',
  vae: 'VAELoader',
  unet: 'UNETLoader',
  controlnet: 'ControlNetLoader',
  upscale: 'UpscaleModelLoader',
  embedding: 'EmbeddingLoader'
}

const MODEL_INPUT_MAP: Record<string, string> = {
  checkpoint: 'ckpt_name',
  lora: 'lora_name',
  vae: 'vae_name',
  unet: 'unet_name',
  controlnet: 'control_net_name',
  upscale: 'model_name',
  embedding: 'embedding_name'
}

export async function submitPrompt(
  endpoint: string,
  workflow: Record<string, unknown>,
  clientId?: string
): Promise<ComfyUIPromptResponse> {
  const body: Record<string, unknown> = { prompt: workflow }
  if (clientId) body.client_id = clientId
  return fetchJson<ComfyUIPromptResponse>(`${endpoint}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export async function getHistory(endpoint: string, promptId: string): Promise<ComfyUIHistoryItem | null> {
  const data = await fetchJson<Record<string, ComfyUIHistoryItem>>(`${endpoint}/history/${promptId}`)
  return data[promptId] ?? null
}

export async function getImage(endpoint: string, filename: string, subfolder: string, type: string): Promise<Buffer> {
  const params = new URLSearchParams({ filename, subfolder, type })
  const res = await fetch(`${endpoint}/view?${params}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`ComfyUI image ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

export async function uploadImage(
  endpoint: string,
  file: Buffer,
  filename: string,
  mimeType = 'image/png'
): Promise<{ name: string; subfolder: string; type: string }> {
  const form = new FormData()
  form.append('image', new Blob([Uint8Array.from(file)], { type: mimeType }), filename)
  form.append('overwrite', 'true')

  const res = await fetch(`${endpoint}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000)
  })
  if (!res.ok) throw new Error(`ComfyUI upload ${res.status}: ${await res.text()}`)
  return res.json() as Promise<{ name: string; subfolder: string; type: string }>
}

export async function interruptPrompt(endpoint: string): Promise<void> {
  await fetch(`${endpoint}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
}

export function extractModelSignature(workflow: Record<string, unknown>): ModelSignature {
  const sig: ModelSignature = { loras: [] }
  for (const node of Object.values(workflow)) {
    const n = node as { class_type?: string; inputs?: Record<string, unknown> }
    if (!n.class_type || !n.inputs) continue
    switch (n.class_type) {
      case 'CheckpointLoaderSimple':
        if (typeof n.inputs.ckpt_name === 'string') sig.checkpoint = n.inputs.ckpt_name
        if (typeof n.inputs.vae_name === 'string') sig.vae = n.inputs.vae_name
        break
      case 'UNETLoader':
        if (typeof n.inputs.unet_name === 'string') sig.unet = n.inputs.unet_name
        break
      case 'VAELoader':
        if (typeof n.inputs.vae_name === 'string') sig.vae = n.inputs.vae_name
        break
      case 'LoraLoader':
        if (typeof n.inputs.lora_name === 'string') sig.loras.push(n.inputs.lora_name)
        break
    }
  }
  return sig
}

export function parseWorkflowNodes(rawJson: Record<string, unknown>): Array<{
  nodeId: string
  nodeType: string
  title?: string
  inputs: Record<string, { type: string; options?: unknown[]; default?: unknown }>
}> {
  const nodes: Array<{
    nodeId: string
    nodeType: string
    title?: string
    inputs: Record<string, { type: string; options?: unknown[]; default?: unknown }>
  }> = []

  for (const [nodeId, nodeRaw] of Object.entries(rawJson)) {
    const node = nodeRaw as { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> }
    if (!node.class_type) continue

    const inputs: Record<string, { type: string; options?: unknown[]; default?: unknown }> = {}
    if (node.inputs) {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'number') {
          inputs[key] = { type: 'link', default: value }
        } else if (typeof value === 'string') {
          inputs[key] = { type: 'STRING', default: value }
        } else if (typeof value === 'number') {
          inputs[key] = { type: Number.isInteger(value) ? 'INT' : 'FLOAT', default: value }
        } else if (typeof value === 'boolean') {
          inputs[key] = { type: 'BOOLEAN', default: value }
        } else {
          inputs[key] = { type: 'JSON', default: value }
        }
      }
    }

    nodes.push({
      nodeId,
      nodeType: node.class_type,
      title: node._meta?.title,
      inputs
    })
  }
  return nodes
}
